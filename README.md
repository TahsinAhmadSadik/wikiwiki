# WikiWiki — Explore the Collective Knowledge of Humanity

**WikiWiki** is an open, collaborative multi-topic encyclopedia and documentation platform designed to curate, organize, and preserve knowledge across diverse domains. Built as a full-stack database-intensive web system, the platform features multi-space wiki hubs, versioned article editing, automated lexical full-text indexing, rollback audit logging, community-driven contribution flags, and hierarchical taxonomy discovery.

This project was developed as part of the **Database Sessional** curriculum in the **Department of Computer Science and Engineering (CSE)** at the **Bangladesh University of Engineering and Technology (BUET)**, under the supervision of **Sukarna Barua**, Associate Professor, Department of CSE, BUET.

<br>

## Live Deployment

* **Production Application**: [https://wikiwiki-app.netlify.app/](https://wikiwiki-app.netlify.app/)
* **API Service**: [https://wikiwiki-api.onrender.com](https://www.google.com/search?q=https://wikiwiki-api.onrender.com)


## Application Preview

<table>
  <tr>
    <td><img src="/screenshots/home.png" alt="Homepage" width="460"/></td>
    <td><img src="/screenshots/article.png" alt="Article Reader" width="460"/></td>
  </tr>
  <tr>
    <td><img src="/screenshots/search.png" alt="Search" width="460"/></td>
    <td><img src="/screenshots/studio.png" alt="Studio" width="460"/></td>
  </tr>
</table>

<br>

## Key Features & Capabilities

### 1. Collaborative Wiki Spaces & Multi-Tier Roles

* **Hierarchical Taxonomy**: Articles and spaces belong to a recursive taxonomy tree (e.g., Computer Science $\rightarrow$ Systems $\rightarrow$ Operating Systems).
* **Dedicated Wiki Spaces**: Each topic space maintains its own branding cover, follower base, member directory, and published article catalog.
* **Granular Role-Based Access Control (RBAC)**:
* **Global Roles**: `owner`, `admin`, `contributor`, `guest`.
* **Space-Level Roles**: `author` (creator/admin), `co_author`, and general readers.



### 2. Full-Text Search Engine (PostgreSQL GIN & Trigrams)

* **Weighted Lexical Parsing**: Articles pre-compute a weighted `tsvector` with Article Titles weighted **'A'** and Editor Content blocks weighted **'B'**.
* **Advanced Boolean Query Parsing**: Direct support for boolean operators via PostgreSQL `to_tsquery`:
    * Exact phrase distance (`<->`)
    * All words / AND (`&`)
    * Any words / OR (`|`)
    * Exclusion / NOT (`!`)


* **Dynamic Highlight Extraction**: Generates contextual search snippets using `ts_headline` with custom styling `<mark>` delimiters.
* **In-Wiki Instant Filter**: Instant client-side search inside individual wiki spaces for quick, zero-latency topic navigation.

### 3. Community Contribution Requests

* **Seeking Edits Flag**: Authors and admins can flag articles needing community expansion (`needs_contribution`).
* **Author Guidance Notes**: Custom notes (`contribution_message`) allow authors to specify what sections need research, diagrams, or citations.
* **Dedicated Contribution Directory**: Direct access via the navbar and search filter to discover all documentation requests across the platform.

### 4. Revision History & Immutable Rollback Audit Trail

* **Versioned Editing**: Edits are preserved as discrete immutable versions (`article_versions`) with change summaries and author attribution.
* **One-Click Atomic Rollbacks**: Authors and admins can restore any previous version as the live published document.
* **Automated Shadow Audit Logging**: Powered by a PostgreSQL trigger (`trg_article_versions_rollback`), every rollback operation is logged into `article_rollback_logs` (tracking previous version, restored version, executing user ID, timestamp, and moderation report linkage).
* **Restricted Audit Viewer**: A dedicated "🛡️ Audit Log" modal visible exclusively to authorized space personnel.

### 5. Content Moderation & Contributor Standing

* **Reporting System**: Users can flag inaccurate information, vandalism, or policy violations against specific revisions.
* **Stored Procedure Resolution**: Administrators resolve reports and apply demerit points via `sp_resolve_report_and_penalize`.
* **Automated Ban Policy**: Reaching 5 demerit points triggers an automatic, platform-wide account ban and session token revocation (`token_version + 1`).

### 6. Personalization & Studio Library

* **Interest-Based Onboarding**: New users select categories and wikis on their first login to seed their personalized reading feed.
* **Dynamic Avatar System**: Custom image uploads processed through Supabase Storage CDN, with automatic gender-neutral bot avatars generated via DiceBear API (`bottts-neutral`).
* **Reading Lists / Bookmarks**: Organize custom public or private article collections.

<br>

## System Architecture & Database Design

### Advanced PostgreSQL Implementation Highlights

| Mechanism | Database Object | Purpose |
| --- | --- | --- |
| **Trigger 1** | `trg_article_versions_search_vector` | Automatically unnests nested JSONB editor content blocks, flattens strings, tokenizes English roots, and computes weighted `tsvector` columns on insert/update. |
| **Trigger 2** | `trg_article_versions_rollback` | Automatically detects when an older revision is re-published and writes an immutable audit record to the `article_rollback_logs` shadow table. |
| **Stored Procedure** | `sp_resolve_report_and_penalize` | Executes atomic moderation workflows: updates report status, records demerit points, triggers auto-bans, and performs atomic version rollbacks. |
| **User-Defined Function (UDF)** | `fn_get_top_articles_by_time_and_topic` | Uses a recursive Common Table Expression (`WITH RECURSIVE category_tree`) to traverse taxonomy subtrees and rank top articles across time windows. |
| **Window Functions** | `DENSE_RANK() OVER (...)` | Powers the cross-topic analytics leaderboard, partitioning articles by taxonomy to find the top performer in every topic. |
| **Trending Metric** | Wiki Velocity Formula | Computes popularity scores: $\text{Score} = (\text{Views} \times 0.4) + (\text{Followers} \times 15) + (\text{Articles} \times 10)$. |

<br>

## Technology Stack

* **Frontend**:
    * React 18 & Vite
    * React Router v6 (Client-side routing & dynamic parameter matching)
    * Recharts (Data visualization & readership distribution pie charts)
    * CSS3 Glassmorphism & Custom Responsive Dark Theme

* **Backend**:
    * Node.js & Express (RESTful API architecture)
    * Prisma ORM & Native `pg` Pool (Connection management & raw query execution)
    * JSON Web Tokens (JWT) with immediate database `token_version` invalidation
    * Bcrypt (12-round salted hashing)
    * Node.js `crypto` (CSPRNG 256-bit entropy SHA-256 tokens)
    * Multer (In-memory streaming image uploads)

* **Third-Party Infrastructure & Cloud**:
* **Database**: PostgreSQL hosted on Supabase
* **Asset Storage**: Supabase Storage CDN (Bucket: `wiki-media`)
* **Transactional Emails**: Resend API
* **Hosting**: Netlify (Frontend SPA CDN) + Render (Containerized Node.js Web Service)

<br>

## Local Development Setup

### Prerequisites

* Node.js (v18.0.0 or higher)
* PostgreSQL instance or a Supabase project

### 1. Repository Setup

```bash
git clone https://github.com/your-username/wikiwiki.git
cd wikiwiki
```

### 2. Backend Configuration

Navigate to the backend directory and install dependencies:

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` root:

```env
PORT=5000
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
JWT_SECRET="your-super-secret-jwt-key"
RESEND_API_KEY="re_your_resend_key"
FRONTEND_URL="http://localhost:5173"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-key"
```

Initialize Prisma and synchronize the database:

```bash
npx prisma generate
npm run dev
```

### 3. Frontend Configuration

In a separate terminal, navigate to the frontend directory:

```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend/` root:

```env
VITE_API_URL="http://localhost:5000/api"
```

Start the Vite development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

<br>

## Contributors

* **Tahsin Ahmad** — Department of CSE, Bangladesh University of Engineering and Technology (BUET)
* **Abdur Rahman Rounak** — Department of CSE, Bangladesh University of Engineering and Technology (BUET)

<br>

## Academic Supervision & Acknowledgments

This project was engineered under the academic guidance of:

* **Sukarna Barua**, Associate Professor, Department of Computer Science and Engineering, Bangladesh University of Engineering and Technology (BUET).

<hr>
Developed with ❤️ at BUET CSE. 