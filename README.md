# Database Setup

This guide will walk you through setting up the database schema for this project. The schema is defined in `src/schemas/schema.sql` and is designed to be used with Cloudflare D1.

## Prerequisites

*   A Cloudflare account
*   Wrangler installed and configured for your Cloudflare account. If you haven't installed Wrangler, follow the official Cloudflare documentation: [https://developers.cloudflare.com/workers/wrangler/install-and-configure/](https://developers.cloudflare.com/workers/wrangler/install-and-configure/)
*   Access to your project's code repository.

## Database Schema

The database schema is defined in `src/schemas/schema.sql`. It includes the following tables:

*   `users`: Stores user information (username, password hash, profile details, etc.)
*   `follows`: Tracks user following relationships.
*   `articles`: Stores articles.
*   `edit_history`: Records the edit history of articles.
*   `comments`: Stores comments on articles, blogs, or user profiles.

You can view the full schema in the `src/schemas/schema.sql` file.

## Environment Variables

Create two files (`.dev.vars` and `.env)

1. **Your `.dev.vars` file should look something like this**

    Example:

    ```.dev.vars
        JWT_SECRET="YOUR-SECRET-HERE"
    ```

1. **Your `.env` file should look something like this**

    Example:

    ```.dev.vars
        CLOUDFLARE_ACCOUNT_ID="RANDOM-PILE-OF-STRINGS"
        CLOUDFLARE_API_TOKEN="RANDOM-PILE-OF-STRINGS"
    ```

    You can get your account id by going to dash.cloudflare.com and click the three dot icon next to your account name and click `Copy account ID`

    The `CLOUDFLARE_API_TOKEN` is typically used by Wrangler for interacting with the Cloudflare API, such as deploying your worker or managing your database!

    [You can click here to get started](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

    You can skip making a `.env` file if you plan on authenticating with OAuth in the terminal instead.


## Setting up the Database (Cloudflare D1)

We will use Cloudflare D1 to create and manage the database.

1.  **Create a D1 Database:**
    *   Log in to your Cloudflare dashboard.
    *   Navigate to the "Workers & Pages" section.
    *   Click on "D1".
    *   Click the "Create database" button.
    *   Give your database a descriptive name (e.g., `wikiverse-db`).
    *   Cloudflare will create your D1 database and provide you with its details, including its **Database ID**.

2.  **Configure Wrangler to use your D1 Database:**
    *   Open your project's `wrangler.toml` file.
    *   In the `[[d1_databases]]` section, add an entry for your new database. You'll need the `binding` name you'll use in your code (e.g., `DB`) and the `database_id` from the previous step.

    Example:

    ```toml
        name = "insert-name"
        main = "path-to-index.js"

        [[d1_databases]]
        binding = "DB"
        database_name = "insert-db-name"
        database_id = "insert-database-id"
    ```

3. **Apply the schema using Wrangler:**
    *   Open your terminal
    * Run `npm run schema` to execute the SQL schema file on your D1 databaase

### `JWT_SECRET`
*   `wrangler dev` will automatically load this variable and make it available in `c.env` when you run your worker locally.

*   **Deployment to Cloudflare:**
    *   Log in to your Cloudflare dashboard.
    *   Navigate to your Worker's settings.
    *   Go to the "Environment Variables" or "Secrets" section.
    *   Add a new **Secret** with the **Key** `JWT_SECRET`.
    *   Enter your actual secret value in the **Secret Value** field.
    *   Save your changes.

    Cloudflare will securely provide this secret to your deployed worker's runtime environment, where it will be accessible via `c.env.JWT_SECRET`.