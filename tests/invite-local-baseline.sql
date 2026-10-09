CREATE TABLE connection_requests (
  id text PRIMARY KEY NOT NULL,
  owner_user_id text NOT NULL,
  requested_by_user_id text NOT NULL,
  requested_by_email text NOT NULL,
  username text NOT NULL,
  meta_app_key text NOT NULL DEFAULT 'default',
  status text NOT NULL DEFAULT 'pending',
  invited_at text,
  invited_by_email text,
  connected_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX connection_requests_owner_username_uq ON connection_requests(owner_user_id,username);
