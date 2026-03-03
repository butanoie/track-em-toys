import Foundation
import Testing

@testable import track_em_toys

// MARK: - Mock URLProtocol

final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.requestHandler else {
            client?.urlProtocolDidFinishLoading(self)
            return
        }

        // URLSession moves httpBody to httpBodyStream; reconstruct it for test assertions
        var mutableRequest = request
        if mutableRequest.httpBody == nil, let stream = mutableRequest.httpBodyStream {
            stream.open()
            var data = Data()
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1024)
            defer { buffer.deallocate(); stream.close() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: 1024)
                if read > 0 { data.append(buffer, count: read) } else { break }
            }
            mutableRequest.httpBody = data
        }

        do {
            let (response, data) = try handler(mutableRequest)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

// MARK: - Test Helpers

private func makeClient() async -> APIClient {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockURLProtocol.self]
    let session = URLSession(configuration: config)
    return await APIClient(baseURL: URL(string: "https://api.test.com")!, session: session)
}

private func mockResponse(
    statusCode: Int = 200,
    json: String = "{}",
    url: String = "https://api.test.com"
) -> (HTTPURLResponse, Data) {
    let response = HTTPURLResponse(
        url: URL(string: url)!,
        statusCode: statusCode,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/json"]
    )!
    return (response, json.data(using: .utf8)!)
}

// MARK: - Tests

@Suite(.serialized)
struct APIClientTests {

    // MARK: - Token Management

    @Test func setAndGetAccessToken() async {
        let client = await makeClient()
        await client.setAccessToken("test_token")
        let token = await client.getAccessToken()
        #expect(token == "test_token")
    }

    @Test func clearAccessToken() async {
        let client = await makeClient()
        await client.setAccessToken("test_token")
        await client.clearAccessToken()
        let token = await client.getAccessToken()
        #expect(token == nil)
    }

    @Test func initialAccessTokenIsNil() async {
        let client = await makeClient()
        let token = await client.getAccessToken()
        #expect(token == nil)
    }

    // MARK: - Auth Header Injection

    @Test func requestIncludesAuthHeader() async throws {
        let client = await makeClient()
        await client.setAccessToken("bearer_test_123")

        MockURLProtocol.requestHandler = { request in
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer bearer_test_123")
            #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
            return mockResponse(json: "{\"id\": \"1\", \"email\": null, \"display_name\": null, \"avatar_url\": null}")
        }

        let endpoint = Endpoint(path: "/test", method: .get, requiresAuth: true)
        let _: UserResponse = try await client.request(endpoint)
    }

    @Test func requestWithoutAuthDoesNotIncludeHeader() async throws {
        let client = await makeClient()
        await client.setAccessToken("should_not_appear")

        MockURLProtocol.requestHandler = { request in
            #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
            return mockResponse(json: "{\"access_token\": \"at\", \"refresh_token\": \"rt\"}")
        }

        let endpoint = Endpoint(path: "/auth/signin", method: .post, requiresAuth: false)
        let _: TokenResponse = try await client.request(endpoint)
    }

    // MARK: - Request Body Encoding

    @Test func requestEncodesBodyAsSnakeCase() async throws {
        let client = await makeClient()

        MockURLProtocol.requestHandler = { request in
            let body = request.httpBody.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            #expect(body?["refresh_token"] as? String == "rt_test")
            #expect(request.httpMethod == "POST")
            return mockResponse(json: "{\"access_token\": \"at\", \"refresh_token\": \"rt\"}")
        }

        let body = RefreshRequestBody(refreshToken: "rt_test")
        let endpoint = Endpoint(path: "/auth/refresh", method: .post, body: body, requiresAuth: false)
        let _: TokenResponse = try await client.request(endpoint)
    }

    // MARK: - HTTP Error Handling

    @Test func requestThrowsOnServerError() async {
        let client = await makeClient()

        MockURLProtocol.requestHandler = { _ in
            mockResponse(statusCode: 500, json: "{\"error\": \"Internal Server Error\"}")
        }

        let endpoint = Endpoint(path: "/test", requiresAuth: false)
        do {
            let _: UserResponse = try await client.request(endpoint)
            #expect(Bool(false), "Should have thrown")
        } catch let error as APIError {
            #expect(error == .httpError(statusCode: 500, message: "Internal Server Error"))
        } catch {
            #expect(Bool(false), "Unexpected error type: \(error)")
        }
    }

    @Test func requestThrowsOnServiceUnavailable() async {
        let client = await makeClient()

        MockURLProtocol.requestHandler = { _ in
            mockResponse(statusCode: 503, json: "{\"error\": \"Service Unavailable\"}")
        }

        let endpoint = Endpoint(path: "/test", requiresAuth: false)
        do {
            let _: UserResponse = try await client.request(endpoint)
            #expect(Bool(false), "Should have thrown")
        } catch let error as APIError {
            #expect(error == .serverUnavailable)
        } catch {
            #expect(Bool(false), "Unexpected error type")
        }
    }

    // MARK: - Decoding

    @Test func requestThrowsOnDecodingError() async {
        let client = await makeClient()

        MockURLProtocol.requestHandler = { _ in
            mockResponse(json: "{\"unexpected\": \"shape\"}")
        }

        let endpoint = Endpoint(path: "/test", requiresAuth: false)
        do {
            let _: AuthResponse = try await client.request(endpoint)
            #expect(Bool(false), "Should have thrown")
        } catch let error as APIError {
            #expect(error == .decodingError)
        } catch {
            #expect(Bool(false), "Unexpected error type")
        }
    }

    // MARK: - requestVoid

    @Test func requestVoidSucceeds() async throws {
        let client = await makeClient()

        MockURLProtocol.requestHandler = { _ in
            mockResponse(statusCode: 204)
        }

        let endpoint = Endpoint(path: "/auth/logout", method: .post, requiresAuth: false)
        try await client.requestVoid(endpoint)
    }

    @Test func requestVoidThrowsOnError() async {
        let client = await makeClient()

        MockURLProtocol.requestHandler = { _ in
            mockResponse(statusCode: 401, json: "{\"error\": \"Unauthorized\"}")
        }

        let endpoint = Endpoint(path: "/test", requiresAuth: false)
        do {
            try await client.requestVoid(endpoint)
            #expect(Bool(false), "Should have thrown")
        } catch let error as APIError {
            #expect(error == .sessionExpired)
        } catch {
            #expect(Bool(false), "Unexpected error type")
        }
    }

    // MARK: - URL Construction

    @Test func requestConstructsCorrectURL() async throws {
        let client = await makeClient()

        MockURLProtocol.requestHandler = { request in
            #expect(request.url?.absoluteString == "https://api.test.com/auth/signin")
            return mockResponse(json: "{\"access_token\": \"at\", \"refresh_token\": \"rt\"}")
        }

        let endpoint = Endpoint(path: "/auth/signin", method: .post, requiresAuth: false)
        let _: TokenResponse = try await client.request(endpoint)
    }
}
