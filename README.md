# ACT Forum

A local student forum built with React, TypeScript, and Node.js SQLite. Requires Node.js 24 or newer.

## Run

```sh
npm install
npm run build
npm start
```

Open http://127.0.0.1:8080. If the server is already running, stop it and restart it after rebuilding: the server loads the built files at startup.

The existing `data/forum.sqlite` database stores accounts, posts, comments, and likes. On startup, pending migrations run once inside a transaction. The threaded-comment migration keeps existing comments as top-level comments and links their ownership to matching local accounts.

## Discussions

- Clicking a post opens its full discussion in the same tab, with a larger title, smaller description, and all comments below. Direct links, refresh, and browser Back/Forward are supported.
- The **Discussions / Քննարկումներ** sidebar page lists all discussions. Each post appears once in the feed.
- The original light-green accent is retained on desktop and mobile.
- Any signed-in user can reply to any comment, including a reply.
- Comments have one like per user. Clicking the like button again removes that like.
- **Top comments** is the default: higher like counts appear first among top-level comments and among replies to the same parent. Ties use oldest first, then comment ID for a stable order.
- **Newest first** sorts each group of siblings by time without moving replies away from their parents.
- The arrow beside an author collapses or expands that comment and its replies.
- Authors can delete their own comments. A deleted placeholder remains so other users' replies are preserved.
- The home feed shows newest posts first. Community cards are in the **Communities / Համայնքներ** sidebar page, with **Joined communities** and **Explore communities** tabs. Only joined communities appear under the sidebar's community sections. English and Armenian are supported.

## Creating communities

Any signed-in, active member or moderator can submit a community from the Communities page. Choose a unique address, a name in English and/or Armenian, and a description. All submissions, including a moderator's own submission, start pending and require an explicit moderator approval before appearing publicly. Members can track their requests and review feedback on the Communities page.

Moderators review requests in Moderation, where they can approve or reject them with optional feedback. Approval publishes the community and automatically joins its creator. Members can then join, leave, and create posts in it. Pending or rejected communities cannot be joined or posted to. Creating a community does not grant moderator permissions. Existing communities and memberships are preserved by the database migration on startup.

## Profiles

Open the profile icon in the top-right corner to see your profile, activity counts, and posts. The profile supports English and Armenian and retains the forum's green theme.

- Upload a JPG, PNG, or WebP picture up to 5 MB (up to 16 megapixels). The browser crops it to a 320-pixel square PNG; the server validates its contents and removes metadata. Pictures are stored with accounts in the local SQLite database and are not committed to Git. You can replace or remove your picture.
- Under **Account settings**, change your username using 3–24 letters, numbers, underscores, or hyphens. Names are normalized to lowercase and must be unique. Existing posts and comments update to the new name, and login uses the new username. Moderator log entries retain the name used at the time of the action.
- To change your password, enter the current password and enter the new password twice. The new password must contain 10–128 characters. A successful change revokes all previous sessions and issues a new session for the current browser.

## Moderation

Sign in as a moderator to see **Moderation / Մոդերացիա** in the sidebar. Moderators can remove any discussion or comment, lock or pin discussions, review and dismiss reports, ban or unban members, and delete member accounts. Actions are recorded in the moderation log. Authorization is enforced on the server, not just by hiding buttons.

Banning a member immediately revokes existing sessions and blocks login. Unbanning requires a fresh login. Deleting an account removes its sign-in access and personal activity such as likes and saved posts; existing posts and comments are anonymized to preserve conversations. Content can be removed separately. Moderator accounts cannot be banned or deleted through the dashboard.

For a **fresh database only**, provide a strong password in the `FORUM_MODERATOR_PASSWORD` environment variable and run `npm run create:moderator`. This creates the reserved username `moderator` with a salted password hash. The command refuses to overwrite an existing account. Do not commit credentials to source control. The requested moderator account has already been provisioned in this project's local database.

## Verify

```sh
npm run check
npm test
```

The tests build the app and exercise migrations, reply validation, sorting, likes, ownership, moderation permissions, deletion, navigation, and rate limits. HTTP integration tests use a separate temporary database to verify real login cookies, ban/session revocation, account deletion, and moderator provisioning without altering the local forum data.

For a preview with a separate database, set an absolute `FORUM_DB_PATH` and an unused `FORUM_PORT` before starting the server. Without these overrides, the original database and port 8080 are used.
