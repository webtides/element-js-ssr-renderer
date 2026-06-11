---
layout: base.njk
title: element-js SSR renderer — Eleventy example
---

This page is **content-driven**: it's authored as Markdown, rendered through a
Nunjucks layout (`src/_includes/base.njk`), and written to `_site/index.html` by
Eleventy. The `element-ssr` **transform** then pre-renders every
`@webtides/element-js` custom element in that output HTML to Declarative Shadow
DOM — **at build time**, with no server and no client JS required to see it.

Custom elements work in the Markdown content too (Eleventy allows raw HTML in
Markdown by default), so this light-DOM greeting is pre-rendered like the rest:

<x-greeting name="Reader"></x-greeting>

The showcase below lives in the layout. View source on the built page — the
shadow components are already `<template shadowrootmode="open">` with their
styles inlined, before any JavaScript.
