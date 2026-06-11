import { TemplateElement, defineElement, html } from "@webtides/element-js";

const css = String.raw;

/**
 * A small interactive counter — the clearest end-to-end hydration demo.
 *
 * On the server, the renderer constructs this element, runs `template()` from
 * its declared properties and emits the result as Declarative Shadow DOM
 * (`<template shadowrootmode="open">`) with the styles below inlined. The
 * browser parses that DSD into a real shadow root *before* any JS runs — so the
 * counter is visible and styled immediately, with no flash.
 *
 * When the client `define()` runs, element-js finds the pre-rendered markup
 * (via the `<!--template-part-->` markers in the SSR output) and *hydrates* it
 * in place rather than re-rendering — the wired-up `events()` then make the
 * + / − buttons mutate the reactive `count`, re-rendering in place.
 *
 * @element x-counter
 * @property {number} count - The current value. Seedable from a `count` attribute.
 * @property {string} label - Text shown before the value.
 */
export default class XCounter extends TemplateElement {
  constructor() {
    super({ shadowRender: true, styles: [XCounter.styles] });
  }

  properties() {
    return {
      count: 0,
      label: "Count",
    };
  }

  events() {
    return {
      "[data-dec]": { click: () => this.count-- },
      "[data-inc]": { click: () => this.count++ },
    };
  }

  template() {
    return html`
      <div part="box" class="counter">
        <button type="button" data-dec aria-label="Decrement">−</button>
        <output aria-live="polite">${this.label}: <strong>${this.count}</strong></output>
        <button type="button" data-inc aria-label="Increment">+</button>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: inline-block;
    }
    .counter {
      display: inline-flex;
      align-items: center;
      gap: var(--el-space-3, 0.75rem);
      padding: var(--el-space-2, 0.5rem) var(--el-space-3, 0.75rem);
      border: 1px solid var(--el-color-border, #d1d5db);
      border-radius: var(--el-radius-md, 0.5rem);
      background: var(--el-color-bg, #fff);
      color: var(--el-color-fg, #111827);
      font: inherit;
    }
    output {
      min-width: 8ch;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    button {
      width: 2rem;
      height: 2rem;
      border: 1px solid var(--el-color-border, #d1d5db);
      border-radius: var(--el-radius-sm, 0.375rem);
      background: var(--el-color-bg-muted, #f3f4f6);
      color: inherit;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
    }
    button:hover {
      border-color: var(--el-color-accent, #2563eb);
    }
  `;
}

export function define() {
  defineElement("x-counter", XCounter);
}
