# Situation summaries and titles

Current titles describe the batted ball and direction, such as **Line Drive to LF**. Depth, starting runners, outs, difficulty and fielding method are separate metadata. Short titles may repeat; editing and selection use the situation key. Compact listings include the display code and starting conditions. Named variants remain separate labels.

The shared library-card presentation model supplies Play, Designer, submission review and Coach Presentation. Fielding method describes caught versus ground-fielded, not the eventual play outcome. Pre-play summaries do not include defensive assignments or relay answers. Historical reviews render the submitted snapshot's metadata.

## Play

The summary takes its natural content height so instructions follow without reserved blank space. Notes are hidden when absent and otherwise use a tinted, bordered disclosure row that expands naturally. Bottom controls remain anchored. Existing game-status hooks remain mounted; the visible summary shows starting conditions.

## Coach Presentation

The field stays full-size and borderless. The situation summary floats inside the image's empty lower-left corner. Play/Pause and Replay appear once in the empty lower-right corner. Coach Board, Situation Library and the controls toggle align at upper right. Situation Library still opens Board & Situation Library.

Controls start collapsed. Their panel opens directly below the upper-right library and expander row, expands to its content height without internal scrolling, and temporarily overlays the field. Playback buttons and keyboard playback actions remain disabled until it is closed. The panel contains Focus, Speed, display options, notes and Back to Designer where applicable. It contains neither the duplicate situation card nor playback buttons. Opening it pauses playback and never changes the field's available width or height. Escape closes it before leaving presentation.

Overlay rectangles use image-relative insets, widths and conservative clearance from the diagonal field edges. The summary height is capped to its empty-space envelope, with long summaries scrolling inside that area. The expanded controls panel is deliberately exempt: it overlays the field at full content height while playback is paused and blocked. Play/Pause and Replay use visible icons and text with 48-pixel targets. They wrap within the safe corner width on narrow fields. The controls menu is anchored to the upper toolbar, independently of the lower playback buttons.

Play and Coach Presentation render AppNavigation with the same icon definitions, header dimensions and workspace permissions. Play retains account-menu, Guide and practice actions through compatibility hooks. Its hidden legacy header does not render a second navigation bar.

## Catalog history

Migration 0052 creates new current revisions and matching version metadata for renamed records. Previous revisions, submissions and adopted snapshots remain unchanged. Title-embedded variant labels are retained in audience.staffVariant. Seed titles follow the same convention.
