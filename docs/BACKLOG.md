B2 Rethink `low attendance`. Reflect `Low attendance` in the announcement message. Low attendance is calculated incorrectly — it only counts courts, ignoring that some run in parallel (capacity is higher). Need to count court streams (e.g. 3 + 2).
B3 Shout to an event. Tag people who have not responded yet. Probably need some kind of "regular player" marker.
B5 Define the minimal set of permissions required for the bot to operate (/setprivacy, add as admin, grant message pin rights, etc.)
B6 Edit announcement time via the UI.
B7 Public announcements should only show "I'm in" and "I'm out" buttons (remove other management buttons). Need to redo the announcement messages.
B9 Unfinalize must not delete already paid payments (bug: deleteByEvent removes all records, including paid ones).
B10 Improve text logs. Currently nothing is visible. Increase rotation to 14 days.
B11 Centralized ACL — access control layer. Commands should be declaratively markable as owner-only or admin-only.
