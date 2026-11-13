import { none } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

// The owner explicitly approved public access to the Eve chat channel.
// This only removes chat-route Basic authentication. Backend services,
// including the persistent-memory API, retain their independent secrets.
export default eveChannel({
  auth: [none()],
});
