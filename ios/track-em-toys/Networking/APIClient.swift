import Foundation

protocol APIClientProtocol: Sendable {
    func setAccessToken(_ token: String) async
    func clearAccessToken() async
    func getAccessToken() async -> String?
    func request<T: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> T
    func requestVoid(_ endpoint: Endpoint) async throws
}

actor APIClient: APIClientProtocol {
    private let baseURL: URL
    private let session: URLSession
    private var accessToken: String?
    private var refreshTask: Task<Bool, Never>?

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func setAccessToken(_ token: String) {
        accessToken = token
    }

    func clearAccessToken() {
        accessToken = nil
    }

    func getAccessToken() -> String? {
        accessToken
    }

    // MARK: - Public Request Methods

    func request<T: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> T {
        let data = try await performRequest(endpoint)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError
        }
    }

    func requestVoid(_ endpoint: Endpoint) async throws {
        _ = try await performRequest(endpoint)
    }

    // MARK: - Request Pipeline

    private func performRequest(_ endpoint: Endpoint) async throws -> Data {
        let urlRequest = try buildRequest(for: endpoint, token: endpoint.requiresAuth ? accessToken : nil)
        let (data, response) = try await executeRequest(urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError("Invalid response")
        }

        // 401 → attempt refresh and retry once
        if httpResponse.statusCode == 401 && endpoint.requiresAuth {
            let refreshed = await attemptRefresh()
            if refreshed {
                let retryRequest = try buildRequest(for: endpoint, token: accessToken)
                let (retryData, retryResponse) = try await executeRequest(retryRequest)
                guard let retryHttp = retryResponse as? HTTPURLResponse else {
                    throw APIError.networkError("Invalid response")
                }
                return try handleResponse(data: retryData, response: retryHttp)
            } else {
                throw APIError.sessionExpired
            }
        }

        return try handleResponse(data: data, response: httpResponse)
    }

    private func handleResponse(data: Data, response: HTTPURLResponse) throws -> Data {
        switch response.statusCode {
        case 200...299:
            return data
        case 401:
            throw APIError.sessionExpired
        case 503:
            throw APIError.serverUnavailable
        default:
            let message: String
            if let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data) {
                message = errorResponse.error
            } else {
                message = HTTPURLResponse.localizedString(forStatusCode: response.statusCode)
            }
            throw APIError.httpError(statusCode: response.statusCode, message: message)
        }
    }

    // MARK: - Refresh Mutex

    private func attemptRefresh() async -> Bool {
        // If a refresh is already in-flight, coalesce onto it
        if let existingTask = refreshTask {
            return await existingTask.value
        }

        let task = Task<Bool, Never> {
            defer { refreshTask = nil }

            guard let storedRefreshToken = try? KeychainService.readRefreshToken() else {
                return false
            }

            do {
                let tokenResponse: TokenResponse = try await refreshRequest(
                    refreshToken: storedRefreshToken
                )
                accessToken = tokenResponse.accessToken
                try? KeychainService.saveRefreshToken(tokenResponse.refreshToken)
                return true
            } catch {
                return false
            }
        }

        refreshTask = task
        return await task.value
    }

    /// Performs the raw refresh token request without going through the 401 interceptor.
    private func refreshRequest(refreshToken: String) async throws -> TokenResponse {
        let body = RefreshRequestBody(refreshToken: refreshToken)
        let endpoint = Endpoint(
            path: "/auth/refresh",
            method: .post,
            body: body,
            requiresAuth: false
        )
        let urlRequest = try buildRequest(for: endpoint, token: nil)
        let (data, response) = try await executeRequest(urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError("Invalid response")
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: "Refresh failed")
        }

        return try decoder.decode(TokenResponse.self, from: data)
    }

    // MARK: - Request Building

    private func buildRequest(for endpoint: Endpoint, token: String?) throws -> URLRequest {
        guard let url = URL(string: endpoint.path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = endpoint.body {
            request.httpBody = try encoder.encode(body)
        }

        return request
    }

    // Extracted for testability (can be overridden in subclass or swapped via protocol)
    private func executeRequest(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch {
            throw APIError.networkError(error.localizedDescription)
        }
    }
}
