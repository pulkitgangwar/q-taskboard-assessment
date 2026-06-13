# TaskBoard Architecture & Data Flow Documentation

## System Architecture Overview

The TaskBoard application utilizes a full-stack monolithic architecture built on Next.js 15. While housed in a single repository, it strictly separates frontend presentation from backend logic using Next.js App Router for both Client Components and API Routes.

### Tech Stack
*   **Frontend**: React 19, Next.js 15 (App Router, primarily Client Components), TanStack Query v5, Tailwind CSS
*   **Backend**: Node.js 20, Next.js API Routes (`src/app/api/...`)
*   **Database**: PostgreSQL 16
*   **ORM**: Prisma 6
*   **Validation**: Zod 3
*   **Authentication**: JSON Web Tokens (JWT) & bcrypt

## Data Models

The database is managed via Prisma (`prisma/schema.prisma`) and consists of four core models:

1.  **User**: Represents an account in the system. Contains authentication credentials (`passwordHash`) and basic profile info (`name`, `email`).
2.  **Project**: Represents a workspace container for tasks. It is inherently tied to a `User` acting as the owner.
3.  **Membership**: A join table managing the many-to-many relationship between `User` and `Project`. It defines access control via the user's `Role` (`admin`, `member`, `viewer`).
4.  **Task**: The core operational unit. Belongs to a `Project` and can be optionally assigned to a `User`. Tracks progress via `status` (`todo`, `in_progress`, `review`, `done`).

## Application Data Flow

The application follows a decoupled Client-Server API pattern. Data flows in a unidirectional loop from user interaction to database persistence and back to the UI.

### 1. Client-Side Request Initiation
1.  **User Interaction**: The user interacts with a React UI component (e.g., clicking "Create Task" or loading the Dashboard).
2.  **TanStack Query Orchestration**: The component utilizes TanStack Query hooks (`useQuery` for fetching data, `useMutation` for side effects) to manage the network request lifecycle, caching, and loading states.
3.  **API Client Fetching**: TanStack Query delegates network calls to the custom `apiFetch` utility (`src/lib/api-client.ts`).
4.  **Authentication Binding**: `apiFetch` synchronously retrieves the JWT token from browser `localStorage` and attaches it to the HTTP `Authorization` header as a Bearer token.
5.  **Network Request**: An HTTP request payload is dispatched to the corresponding Next.js API route.

### 2. Server-Side Processing
1.  **Route Handling**: The Next.js API route (e.g., `src/app/api/tasks/[id]/route.ts`) receives the incoming HTTP request.
2.  **Authentication & Authorization**:
    *   The backend calls the `getCurrentUser` utility (`src/lib/auth.ts`), which parses the `Authorization` header, verifies the JWT signature, and queries the user from the database.
    *   The route verifies if the authenticated user has the necessary permissions (e.g., checking `Membership` roles to ensure they are an admin or member before allowing modifications).
3.  **Data Validation**: Incoming request bodies are strictly validated against a shared Zod schema (e.g., `createTaskSchema` in `src/schemas/task.ts`). Validation failures immediately return a `400 Bad Request` payload.
4.  **Database Transaction**:
    *   Once validated, the API route invokes the Prisma Client (`src/lib/prisma.ts`).
    *   Prisma translates the structured object queries into parameterized, SQL-injection-safe queries against the PostgreSQL database.
5.  **Response Generation**: Upon query resolution, the API route serializes the resulting data into a JSON response using `NextResponse.json()` and dispatches it back to the client.

### 3. Client-Side Resolution
1.  **Data Reception**: The `apiFetch` interceptor parses the JSON response. If an HTTP error code is returned, an Error is thrown to be gracefully caught by TanStack Query.
2.  **Cache Invalidation & State Update**: TanStack Query merges the new data into its internal client-side cache. For mutations, queries may be invalidated to trigger background refetches.
3.  **UI Re-render**: React automatically re-renders the subscribed components with the fresh data, ensuring the UI accurately reflects the new server state.

## Authentication Flow

TaskBoard implements a stateless authentication model using JWTs:

1.  **Login/Registration**: The user submits their email and password to `/api/auth/login` or `/api/auth/register`.
2.  **Cryptographic Verification**: The backend verifies the user existence and compares the provided password against the stored `bcrypt` hash.
3.  **Token Issuance**: A JWT containing the user's ID is cryptographically signed and returned in the HTTP response.
4.  **Client Storage**: The frontend `setSession` utility writes the JWT and minimal user metadata to `localStorage`.
5.  **Persistence**: For the duration of the session, the token is transparently attached to subsequent requests. The session is cleared by removing the item from `localStorage` upon logout.

## Directory Responsibilities

*   `/src/app`: The Next.js App Router core. Contains UI pages (e.g., `dashboard/page.tsx`) and the REST API implementation (`api/`).
*   `/src/components`: Presentational and container React components.
*   `/src/lib`: Core infrastructure, including the API client, authentication utilities, JWT signing/verification, and the initialized Prisma singleton.
*   `/src/schemas`: Zod schemas utilized symmetrically by both the frontend forms and backend API routes to enforce contract integrity.
*   `/prisma`: The source of truth for the database schema, including models and generated migration artifacts.
