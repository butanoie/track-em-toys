REQUIREMENTS DOCUMENT

**Toy Collection Catalog & Pricing App**

Version 1.0 --- February 22, 2026

Status: Draft

*CONFIDENTIAL*

Table of Contents

1\. Introduction

1.1 Purpose

This document defines the requirements for the Toy Collection Catalog &
Pricing App, a personal inventory management system designed for serious
toy collectors. The application will enable a collector to
comprehensively catalog their collection, associate photos and barcode
scans with each item, track original retail and current resale pricing,
and maintain insurance-grade records of collection value.

1.2 Scope

The system comprises three primary components: a SQL-backed data
repository, a responsive web front end for desktop-based catalog
management and reporting, and a mobile application (iOS initially, with
potential Android expansion) for on-the-go photo capture, barcode
scanning, and item entry. The system is designed for single-user
(collector) use but should be architected to support multi-user access
in future iterations.

1.3 Target Collection Domains

The initial release will focus on two primary toy lines with distinct
cataloging requirements:

-   Transformers --- Including official Hasbro/Takara Tomy releases and
    unlicensed third-party figures (e.g., FansToys, MakeToys,
    XTransbots, Iron Factory, Magic Square, NewAge, etc.). Third-party
    figures require tracking of manufacturer, product/release line, and
    the official character the figure represents or is inspired by.

-   G.I. Joe --- Including vintage (1964--1978), A Real American Hero
    (1982--1994), modern era, and Classified Series releases. Requires
    tracking of figure scale, accessory completeness, and card/packaging
    condition where applicable.

The data model should be extensible to accommodate additional toy lines
(e.g., Star Wars, MOTU, Marvel Legends) without schema changes.

1.4 Definitions and Abbreviations

  --------------------- -------------------------------------------------
  **Term**              **Definition**

  MSRP                  Manufacturer's Suggested Retail Price

  3P / Third-Party      Unlicensed figures produced by independent
                        companies, typically representing characters from
                        official franchises

  MIB / MISB            Mint In Box / Mint In Sealed Box --- item
                        condition designations

  UPC                   Universal Product Code --- barcode standard on
                        retail packaging

  SKU                   Stock Keeping Unit --- retailer or manufacturer
                        item identifier

  Transfer Learning     ML technique that reuses a pre-trained model as a
                        starting point for a new classification task

  Core ML               Apple's framework for running machine learning
                        models on-device

  Create ML             Apple's tool for training machine learning models
                        on macOS
  --------------------- -------------------------------------------------

2\. System Architecture Overview

2.1 High-Level Architecture

The system follows a three-tier architecture with clean separation of
concerns:

-   Presentation Tier --- Web front end (responsive SPA) and native iOS
    mobile app

-   Application Tier --- RESTful API server handling business logic,
    authentication, image processing, and price-lookup orchestration

-   Data Tier --- SQL relational database for structured collection
    data, plus object/file storage for photographs

2.2 Proposed Technology Stack

  --------------- ------------------------ ---------------------------------
  **Component**   **Recommended            **Rationale**
                  Technology**             

  Database        PostgreSQL               Robust relational model, JSONB
                                           for flexible metadata, full-text
                                           search, strong ecosystem

  API Server      Node.js                  Rapid development, extensive
                  (Express/Fastify) or     library ecosystem for web
                  Python (FastAPI)         scraping and data processing

  Web Front End   React or Vue.js (SPA)    Component-based architecture,
                                           rich ecosystem, responsive design
                                           support

  Mobile App      Native iOS               Required for Core ML integration,
                  (Swift/SwiftUI)          camera/barcode APIs, Neural
                                           Engine access

  Image Storage   Local filesystem or      Scalable photo storage with CDN
                  S3-compatible object     potential; keeps DB lean
                  store                    

  ML Model        Core ML + Create ML      On-device inference, \~7 MB
                  (transfer learning)      models, no network calls, Apple
                                           Neural Engine optimized

  Barcode         AVFoundation (iOS) / Web Native platform APIs for UPC/EAN
  Scanning        Barcode Detection API    barcode reading
  --------------- ------------------------ ---------------------------------

2.3 Deployment Options

The system should support flexible deployment to accommodate a personal
collector's infrastructure preferences:

-   Self-hosted --- Docker Compose stack running on a local NAS,
    Raspberry Pi, or home server (lowest cost, full data ownership)

-   Cloud-hosted --- Small VPS (e.g., DigitalOcean, Linode) or managed
    services (e.g., Railway, Render) for always-on accessibility

-   Hybrid --- Cloud API + database with local image storage synced via
    S3-compatible protocol

3\. Data Model

3.1 Core Entities

The following entity relationship model defines the primary data
structures. All entities include standard audit columns (created_at,
updated_at, created_by).

3.1.1 Collection Item (Primary Entity)

  -------------------- ---------------- -------------------------------------
  **Field**            **Type**         **Description**

  id                   UUID / SERIAL PK Unique item identifier

  name                 VARCHAR(255)     Manufacturer's product name (e.g.,
                                        "Optimus Prime" for official,
                                        "Phoenix" for third-party)

  franchise            VARCHAR(100)     Top-level franchise (Transformers,
                                        G.I. Joe, etc.)

  toy_line_id          FK → toy_lines   Reference to the product line /
                                        series

  manufacturer_id      FK →             Hasbro, Takara Tomy, FansToys, etc.
                       manufacturers    

  is_third_party       BOOLEAN          Flag for unlicensed / third-party
                                        figures

  character_name       VARCHAR(255)     Character the figure represents
                                        (official name)

  third_party_homage   VARCHAR(255)     Official character this 3P figure is
                                        based on (nullable)

  year_released        SMALLINT         Year of original release

  upc_barcode          VARCHAR(50)      UPC/EAN barcode value from packaging

  sku                  VARCHAR(100)     Manufacturer or retailer SKU

  product_code         VARCHAR(100)     User-definable item identifier /
                                        designation (e.g., "MP-44", "FT-44",
                                        "CS-01"). Typically the
                                        manufacturer's product code.

  condition            ENUM             MISB, MIB, Loose Complete, Loose
                                        Incomplete, Damaged

  completeness_notes   TEXT             Missing accessories, damage details,
                                        etc.

  acquisition_date     DATE             Date acquired by collector

  acquisition_price    DECIMAL(10,2)    Price paid by collector

  acquisition_source   VARCHAR(255)     Where acquired (store name, seller,
                                        convention, etc.)

  notes                TEXT             Free-form collector notes

  metadata_json        JSONB            Extensible key-value metadata (scale,
                                        material, edition, etc.)
  -------------------- ---------------- -------------------------------------

3.1.2 Manufacturer

  ---------------------- ---------------- -------------------------------------
  **Field**              **Type**         **Description**

  id                     SERIAL PK        Unique manufacturer identifier

  name                   VARCHAR(255)     Company name (e.g., "FansToys",
                                          "Hasbro")

  is_official_licensee   BOOLEAN          Whether this manufacturer holds an
                                          official license

  country                VARCHAR(100)     Country of origin

  website_url            VARCHAR(500)     Official website (if known)

  aliases                TEXT\[\]         Alternative names / abbreviations
                                          (e.g., \[\"FT\", \"Fans Toys\"\])

  notes                  TEXT             Collector notes about this
                                          manufacturer
  ---------------------- ---------------- -------------------------------------

3.1.3 Toy Line / Product Series

  ----------------- ---------------- -------------------------------------
  **Field**         **Type**         **Description**

  id                SERIAL PK        Unique line identifier

  name              VARCHAR(255)     Line name (e.g., "Masterpiece",
                                     "Classified Series")

  franchise         VARCHAR(100)     Parent franchise

  manufacturer_id   FK →             Producing manufacturer
                    manufacturers    

  year_started      SMALLINT         Year line launched

  year_ended        SMALLINT         Year line discontinued (nullable if
                                     active)

  scale             VARCHAR(50)      Figure scale if consistent (e.g.,
                                     "1:6", "Chug-scale")

  description       TEXT             Line description and notable
                                     characteristics
  ----------------- ---------------- -------------------------------------

3.1.4 Item Photos

  ------------------- ------------------ -------------------------------------
  **Field**           **Type**           **Description**

  id                  UUID PK            Unique photo identifier

  item_id             FK →               Parent item
                      collection_items   

  file_path           VARCHAR(500)       Path/URL to stored image file

  thumbnail_path      VARCHAR(500)       Path to generated thumbnail

  photo_type          ENUM               Front, Back, Side, Box Art,
                                         Accessory, Damage, Other

  is_primary          BOOLEAN            Whether this is the primary display
                                         photo

  capture_date        TIMESTAMP          When photo was taken

  ml_classification   JSONB              ML model classification results
                                         (label, confidence)
  ------------------- ------------------ -------------------------------------

3.1.5 Price Records

  ----------------- ------------------ -------------------------------------
  **Field**         **Type**           **Description**

  id                SERIAL PK          Unique price record identifier

  item_id           FK →               Parent item
                    collection_items   

  price_type        ENUM               MSRP, Resale_Listing, Resale_Sold,
                                       Appraisal, Insurance_Value

  amount            DECIMAL(10,2)      Price amount

  currency          CHAR(3)            ISO 4217 currency code (e.g., USD,
                                       CAD)

  source_platform   VARCHAR(100)       eBay, Craigslist, Facebook
                                       Marketplace, Amazon, retail store,
                                       etc.

  source_url        VARCHAR(1000)      URL of listing (if applicable)

  listing_date      DATE               Date the price was observed or
                                       listing was active

  is_sold           BOOLEAN            Whether this was a completed sale vs.
                                       asking price

  notes             TEXT               Condition notes, lot details,
                                       shipping included, etc.
  ----------------- ------------------ -------------------------------------

3.1.6 Tags and Custom Fields

A flexible tagging system and JSONB metadata column on collection_items
allow the collector to organize items by arbitrary criteria (e.g.,
"displayed", "in storage", "wishlist", "for trade") without requiring
schema changes. Tags should support hierarchical grouping (e.g.,
"Location \> Shelf 3 \> Row 2").

4\. Functional Requirements

4.1 Collection Management

1.  **Add Item ---** Create a new collection item with all fields from
    the data model. Support manual entry via web or mobile, barcode scan
    auto-fill, and photo-based identification suggestions.

2.  **Edit Item ---** Modify any field on an existing item. Changes
    should be timestamped in the audit log.

3.  **Delete Item ---** Soft-delete items (move to archive) with option
    for permanent deletion. Associated photos and price records should
    cascade appropriately.

4.  **Bulk Import ---** Import items from CSV/Excel spreadsheet for
    initial collection migration. Support column mapping to data model
    fields.

5.  **Search & Filter ---** Full-text search across item names,
    character names, notes, and manufacturer names. Filter by franchise,
    toy line, manufacturer, condition, year, third-party status, tags,
    and price range.

6.  **Tags & Organization ---** Apply multiple tags to items. Support
    hierarchical tags for physical location tracking (room, shelf, bin).
    Filter and group by tags.

4.2 Photo Management

7.  **Photo Capture ---** Capture photos directly from the mobile app
    camera. Support multiple photos per item with type classification
    (front, back, box art, etc.).

8.  **Photo Upload ---** Upload existing photos from device gallery via
    web or mobile. Support drag-and-drop on web, multi-select on mobile.

9.  **Thumbnail Generation ---** Automatically generate thumbnails for
    gallery views. Store at multiple resolutions for responsive display.

10. **Primary Photo Selection ---** Designate one photo as the primary
    display image for each item. Default to first photo uploaded.

4.3 Barcode Scanning

11. **UPC/EAN Scanning ---** Scan barcodes on toy packaging using the
    mobile device camera. Decode UPC-A, UPC-E, EAN-8, and EAN-13
    formats.

12. **Barcode Lookup ---** After scanning, query open/public product
    databases (e.g., Open Food Facts UPC database, UPCitemdb) to
    retrieve product name, manufacturer, and description. Pre-populate
    item fields with matched data.

13. **Manual Barcode Entry ---** Allow manual entry of barcode numbers
    when scanning is impractical (e.g., damaged packaging, captured from
    a listing photo).

4.4 Image-Based Identification (ML)

Leverage on-device machine learning to assist in identifying items from
photos. This is a progressive feature that improves as the collection
grows and more training data becomes available.

14. **Photo Classification ---** Use a Core ML image classification
    model (trained via Create ML with transfer learning) to suggest item
    identity from a photo. Present top-N candidates with confidence
    scores. Require \~80--200 training images per item class.

15. **First-Pass Filtering ---** Use Apple's built-in Vision
    ClassifyImageRequest as a pre-filter to confirm the photo contains a
    toy/robot/action figure before running the custom model.

16. **Model Updates ---** Support model versioning and over-the-air
    updates so the ML model can be retrained as new items are added to
    the collection without requiring a full app update.

17. **Training Pipeline ---** Document a repeatable workflow for the
    collector to retrain the model: export labeled photos from the
    catalog, run Create ML training on macOS, and deploy the updated
    .mlmodel to the app.

4.5 Pricing and Valuation

18. **MSRP Tracking ---** Record the original MSRP in the collector's
    local currency at time of release. Support multiple currencies with
    conversion reference.

19. **Manual Price Entry ---** Allow the collector to manually enter
    observed resale prices with source attribution (platform, URL, date,
    sold vs. asking). This is the primary and most reliable method.

20. **eBay Sold Listings (Compliant) ---** Integrate with the eBay
    Browse API (or eBay Partner Network affiliate API) to search
    completed/sold listings for comparable items. This is TOS-compliant;
    eBay provides official APIs for this purpose. Display average sold
    price, price range, and recent sale dates.

21. **Price History ---** Maintain a time-series history of all recorded
    prices per item. Display trend charts showing value changes over
    time.

22. **Collection Valuation Summary ---** Calculate total estimated
    collection value based on the most recent price data for each item.
    Support insurance report generation with itemized values.

4.6 Marketplace Price Sourcing --- TOS Compliance Strategy

A critical requirement is that all price data sourcing must comply with
the terms of service of each platform. The following outlines the
approach per marketplace:

  -------------- ------------------------------------- -------------------
  **Platform**   **Approach**                          **TOS Status**

  eBay           Use official eBay Browse API or       Compliant ---
                 Partner Network API to search         official API
                 sold/completed listings. Requires     
                 eBay developer account and API key.   

  Amazon         Use Amazon Product Advertising API    Compliant ---
                 (requires Associates account) for     official API
                 current retail pricing. Affiliate     
                 program provides TOS-compliant        
                 access.                               

  Facebook       No public API. Manual price entry     Compliant --- no
  Marketplace    only. User copies listing details     scraping
                 into the app manually.                

  Craigslist     No public API; TOS explicitly         Compliant --- no
                 prohibits scraping. Manual price      scraping
                 entry only.                           

  Mercari        No public API for sold prices. Manual Compliant --- no
                 price entry only.                     scraping

  Price Charting Evaluate whether these                Research required
  / Hobbydb      collector-focused databases offer     
                 APIs or data partnerships. Some offer 
                 embeddable price data.                
  -------------- ------------------------------------- -------------------

The guiding principle is: if a platform offers an official API, use it.
If not, the user enters data manually. The system will never scrape,
crawl, or automate access to any platform without explicit API
authorization.

4.7 Reporting and Export

23. **Insurance Report ---** Generate a printable/PDF report of the full
    collection with item photos, descriptions, acquisition dates, and
    current estimated values. Suitable for submission to an insurance
    provider.

24. **Collection Summary Dashboard ---** Web dashboard showing total
    item count, total collection value, value by franchise, value by toy
    line, most valuable items, and recent additions.

25. **CSV/Excel Export ---** Export the full catalog or filtered subsets
    as CSV or Excel files for external analysis or backup.

26. **Backup & Restore ---** Full database dump and photo archive
    export. Importable for disaster recovery.

5\. Non-Functional Requirements

5.1 Performance

1.  Search results should return within 500ms for collections of up to
    10,000 items.

2.  On-device ML classification should complete within 1 second per
    image on iPhone 15 Pro or later.

3.  Photo upload and thumbnail generation should complete within 3
    seconds per image on a standard broadband connection.

5.2 Security & Privacy

4.  All API communication must use HTTPS/TLS 1.2+.

5.  User authentication via email/password with bcrypt hashing, with
    support for OAuth2 providers (Apple, Google) in future.

6.  Collection data (including photos and financial valuations) is
    private by default and must not be shared with third parties or used
    for model training without explicit consent.

7.  ML inference runs entirely on-device; photos are never sent to
    external classification services.

5.3 Reliability & Data Integrity

8.  Database should support point-in-time recovery. Daily automated
    backups required.

9.  Soft-delete pattern for all user data. No permanent deletion without
    explicit confirmation.

10. Mobile app must support offline data entry with sync-on-reconnect
    for field use (conventions, flea markets).

5.4 Scalability

11. System should comfortably handle 10,000+ collection items with
    50,000+ photos without degradation.

12. Database schema must be franchise-agnostic --- adding new toy lines
    should not require schema migrations.

5.5 Usability

13. Mobile app should support single-handed operation for rapid
    cataloging (scan barcode → snap photo → confirm/edit → save).

14. Web interface should support keyboard shortcuts for power users
    cataloging large batches.

6\. Image Recognition Technical Approach

Based on the iOS image recognition research conducted for this project,
the following approach is recommended. Refer to the companion document
"iOS APIs for Image-Based Object Recognition" for full technical details
and code samples.

6.1 Recommended Approach: Core ML + Create ML

Use Create ML Image Classification with transfer learning as the primary
identification method. This approach offers the best balance of
accuracy, model size, and integration with the iOS ecosystem.

  --------------------- -------------------------------------------------
  **Attribute**         **Details**

  Training Tool         Create ML app on macOS (GUI, no code) or
                        MLImageClassifier API

  Training Data         \~80--200 photos per item class, organized in
                        labeled folders

  Model Technique       Transfer learning on Apple's pre-trained backbone

  Model Size            \~7 MB (transfer learning) vs. \~65 MB (full
                        network)

  Inference Speed       Real-time on Neural Engine (iPhone 15 Pro+)

  Network Required      No --- fully on-device inference

  Output                Top-N labels with confidence scores

  iOS Minimum           iOS 26.2+
  --------------------- -------------------------------------------------

6.2 Pre-Filter with Vision Framework

Before running the custom model, use Apple's built-in
ClassifyImageRequest to confirm the photo contains a relevant subject
(toy, robot, action figure). This avoids wasting inference cycles on
irrelevant images and provides a better user experience.

6.3 Future Enhancement: Object Detection

If the collector needs to identify multiple figures in a single scene
photo (e.g., a display shelf), upgrade to Create ML Object Detection.
This provides bounding boxes and per-object labels but requires
annotated training data with coordinate information. Recommended as a
Phase 2 enhancement.

6.4 Training Data Strategy

The collector's own catalog photos become the training dataset over
time. As items are manually cataloged and confirmed, their photos feed
back into the training pipeline. This creates a virtuous cycle: the more
items cataloged, the better the ML model becomes at identifying new
additions.

-   Phase 1: Manual cataloging with barcode + manual entry builds
    initial photo corpus

-   Phase 2: Train initial model once 80+ images exist per class for the
    most common items

-   Phase 3: ML-assisted entry --- snap a photo, model suggests
    identity, user confirms or corrects

-   Phase 4: Corrections feed back into retraining for continuous
    improvement

7\. Third-Party Figure Tracking

Unlicensed third-party Transformers figures represent a significant and
complex segment of the collection. These figures are produced by dozens
of independent manufacturers, often under multiple brand names, and
typically represent (without naming) characters from official
Transformers media. The system must handle this domain with
purpose-built data fields and workflows.

7.1 Required Data Fields for Third-Party Figures

-   Manufacturer Name --- The producing company (e.g., FansToys,
    XTransbots, Magic Square)

-   Manufacturer Aliases --- Some companies operate under multiple names
    or abbreviations

-   Product Line / Series --- The manufacturer's product line (e.g.,
    FansToys "Masterpiece" scale, Iron Factory "Legends" scale)

-   Item Designation --- The manufacturer's product code (e.g., "FT-44",
    "IF EX-36")

-   Third-Party Homage Character --- The official Transformers character
    this figure represents or is inspired by

-   Scale / Size Class --- MP (Masterpiece), Legends,
    Voyager-equivalent, etc.

-   Release Version --- Many 3P figures have multiple releases (v1, v2,
    reissue, metallic version)

7.2 Third-Party Manufacturer Database

Maintain a curated table of known third-party manufacturers with their
product lines and naming conventions. This assists in data entry by
offering autocomplete suggestions and reduces data inconsistency. The
initial database should be seeded with the major known manufacturers and
can be expanded by the collector over time.

7.3 Searching and Grouping

The system should support queries like "show me all third-party Optimus
Prime figures" by searching the third_party_homage field across
manufacturers. This allows the collector to see all versions of a
character across official and unofficial releases side by side.

8\. User Interface Requirements

8.1 Web Application

-   Dashboard --- Collection summary, total value, recent additions,
    value trends chart

-   Catalog Browser --- Grid and list views with filterable sidebar
    (franchise, line, manufacturer, condition, tags)

-   Item Detail View --- Full item record with photo gallery, price
    history chart, edit capabilities

-   Search --- Global search bar with instant results and advanced
    filter panel

-   Reports --- Insurance report generator, value breakdown by category,
    CSV/Excel export

-   Settings --- Manufacturer management, toy line management, tag
    management, user preferences

-   Bulk Operations --- Multi-select items for batch tagging, condition
    updates, or export

8.2 Mobile Application (iOS)

-   Quick Add Flow --- Streamlined workflow: Scan barcode → Snap photo →
    Review auto-populated fields → Edit → Save

-   Camera Integration --- In-app camera with barcode overlay mode and
    photo capture mode

-   ML Identification --- Point camera at figure, receive identification
    suggestions in real-time

-   Collection Browser --- Scrollable grid with search, optimized for
    mobile interaction

-   Offline Mode --- Full data entry capability when offline. Queue
    syncs when connectivity returns.

-   Item Detail --- View and edit item details, swipe through photos,
    view price history

9\. Risks, Assumptions, and Open Questions

9.1 Risks

  ---------------------- ------------ ----------------------------------------
  **Risk**               **Impact**   **Mitigation**

  ML model accuracy may  High         Start with broad categories
  be low for                          (character-level) rather than
  similar-looking 3P                  version-level. Refine as training data
  figures                             grows.

  Third-party APIs       Medium       Abstract API integrations behind a
  (eBay, Amazon) may                  service layer. Fall back to manual entry
  change terms or rate                if APIs become unavailable.
  limits                              

  Third-party            Medium       Build a community-sourced manufacturer
  manufacturer data is                database. Allow the collector to curate
  fragmented and                      and correct data.
  inconsistent                        

  Photo storage costs    Low          Use compression, thumbnail optimization,
  may grow significantly              and tiered storage. Self-hosted option
  for large collections               keeps costs fixed.
  ---------------------- ------------ ----------------------------------------

9.2 Open Questions

-   Should the system support a shared community database of
    items/prices in future, or remain strictly personal?

-   What is the target collection size at launch? This affects initial
    performance tuning and storage provisioning decisions.

-   Is Android support required in Phase 1, or can it be deferred?
    (Affects technology choices for ML and barcode scanning.)

-   Should the app support tracking items on a wishlist or want-list,
    with price alerts from eBay?

-   Is there a need to track accessories separately from figures (e.g.,
    an accessory pack with 15 items)?

-   What level of insurance reporting detail does the collector's
    insurance provider require?

10\. Implementation Phases

Phase 1 --- Foundation

Core data model and CRUD operations. PostgreSQL database setup. RESTful
API with authentication. Web front end with catalog browsing, item
entry, search and filtering, photo upload, and basic reporting. CSV
import for initial collection migration.

Phase 2 --- Mobile & Scanning

iOS app with camera integration, barcode scanning (AVFoundation), and
photo capture. Offline data entry with sync. Quick-add workflow
optimized for rapid cataloging sessions.

Phase 3 --- Pricing Integration

eBay Browse API integration for sold listing price lookups. Manual price
entry for other platforms. Price history tracking and trend charts.
Collection valuation dashboard and insurance report generation.

Phase 4 --- ML Identification

Train initial Core ML image classification model using cataloged photos.
Integrate on-device inference into the iOS app. Build retraining
pipeline documentation. Add Vision pre-filter for input validation.

Phase 5 --- Polish & Expansion

Object detection for multi-figure scenes. Additional marketplace API
integrations. Community data features (if desired). Android app
consideration. Advanced reporting and analytics.

Appendix A: Related Research Documents

-   iOS APIs for Image-Based Object Recognition
    (ios-image-recognition-research.md) --- Detailed technical analysis
    of Vision, Core ML, Create ML, and Google ML Kit approaches for
    on-device image classification

Appendix B: Revision History

  ------------- ---------------- ---------------- ----------------------------
  **Version**   **Date**         **Author**       **Description**

  1.0           February 22,     ---              Initial draft
                2026                              
  ------------- ---------------- ---------------- ----------------------------
