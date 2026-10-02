# Gov BB authoring tools

The form builder lets authorized government service authors create and edit
form recipes and service content pages. Their work is a local draft until
they use the existing Save or Deploy controls. They need clear validation,
reliable editing claims, and a reviewable path from draft to publication.

The assistant helps authors understand, create, and improve the current form
or page, including reading an existing PDF/image. Ask answers questions.
Review edits shows proposed changes and warnings before explicit Apply.
Conversation history belongs to the current user, artifact, and browser.

The application uses the established Inter typography, neutral surface tokens,
light/dark themes, compact controls, and CSS modules. The assistant is a right
dock on desktop and a full-screen dialog on small screens. Its reference is
the supplied Cloudflare assistant layout, adapted to this application's
existing visual system. New AI components live under `app/components/ui/ai`.

Protected state includes payment configuration, MDA selection, credentials,
opaque recipe metadata, fixed content paths, and editing permissions. AI
changes never save or deploy automatically. The AWS backend and existing
citizen-facing apps remain outside this interface redesign.
