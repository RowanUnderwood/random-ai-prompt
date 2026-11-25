# Repository instructions for Codex and other agents

Follow [CLAUDE.md](CLAUDE.md), including its notes-first workflow and repository safety rules.

## Keep the agent context current

For every future feature, bug fix, configuration change, or workflow change, review `CLAUDE.md`
before declaring the task complete. If the change affects supported features, architecture,
entry points, build/run/test commands, configuration, service ownership, operational caveats,
or agent instructions, update the relevant overview or rule in `CLAUDE.md` in the **same commit**.
Update the detailed system notes and session/changelog entries as well; notes alone do not
replace maintaining `CLAUDE.md`. Keep the overview concise and link to detailed notes.

If the change needs no context edit, record that `CLAUDE.md` was reviewed and why no edit was
needed in the session log. Check documentation links and the staged diff before committing.
Keep durable rules in repository files, not private agent memory.
