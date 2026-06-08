// Client hydration entry, loaded by `<script type="module" src="/src/client.js">`
// in index.html. Loading each component's `define` upgrades the matching tags;
// because the built HTML already contains their pre-rendered markup + hydration
// markers, element-js hydrates in place instead of re-rendering from scratch.

// element-library components: import the side-effecting `/define` entry.
import "@webtides/element-library/button/define";
import "@webtides/element-library/notification/define";

// This project's components: call their exported `define()`.
import { define as defineCounter } from "./components/x-counter.js";
import { define as defineGreeting } from "./components/x-greeting.js";
defineCounter();
defineGreeting();
