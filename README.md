# Empire Builder

> _Build your model railroad empire._

Empire Builder is a free online track planning application for model railroad enthusiasts.

# Technology

* Language: [TypeScript](https://www.typescriptlang.org/)
* Canvas library: [Paper.js](https://paperjs.org/)
* Package manager: [npm](https://www.npmjs.com/)
* Build tool: [Vite](https://vite.dev/)

# Prime directive

**Working code is not enough**. Apply principles from _A Philosophy of Software Design_ to minimize complexity:

* **Do make modules deep**: Design units that do a lot of work hidden behind a simple, narrow interface.
* **Do design it twice**: Create at least two different approaches for any major component before picking one.
* **Do pull complexity downward**: Let a module handle its own internal special cases and default behaviors rather than pushing that burden to the caller.
* **Do write comments for the non-obvious**: Document intent, high-level abstractions, and the "why" that code alone cannot convey.
* **Do separate general-purpose and special-purpose code**: Make components somewhat general-purpose so they provide cleaner, deeper abstractions.
* **Do define errors out of existence**: Design APIs and logic so special cases and exceptions disappear or handle themselves cleanly.
* **Don't create shallow modules**: Avoid classes or methods whose interface complexity is nearly as large as the work they actually do.
* **Don't practice tactical programming**: Avoid quick fixes and temporary patches that add invisible technical debt ("death by a thousand cuts").
* **Don't let information leak**: Avoid exposing internal design decisions, data structures, or database fields through a module's public interface.
* **Don't write redundant comments**: Skip comments that simply restate what the code already makes obvious.
* **Don't organize by temporal order**: Avoid splitting code into separate modules based strictly on the sequence of steps (like "read, then process, then write"), which causes information leakage.
* **Don't use vague names**: Avoid short or generic names (`n`, `d`, `Manager`, `Helper`) that fail to communicate precise meaning.

# Conventions

Use American English.

Be concise.

Be precise.

Name things exactly what they are.

Variables are usually nouns; functions are usually verbs.

Document all types, properties, and functions.

Comments describe what _is_, not what _was_ or what _will be_.
