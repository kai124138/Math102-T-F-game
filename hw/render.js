/*
 * Markdown + LaTeX -> HTML. Shared by the page and the build-time checker so both render the same way.
 *
 * Math is pulled out before Markdown runs (so _ and * inside formulas are never treated as emphasis),
 * then each placeholder is replaced with KaTeX output. Display math ($$…$$) becomes its own block.
 */
(function (root) {
  "use strict";

  function renderMarkdown(src, deps) {
    const { marked, katex, throwOnError = false, strict = "ignore" } = deps;
    if (!src) return "";
    const math = [];
    let s = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      math.push([tex, true]);
      return `\n\n@@D${math.length - 1}@@\n\n`;
    });
    s = s.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
      math.push([tex, false]);
      return `@@M${math.length - 1}@@`;
    });

    let html = marked.parse(s, { gfm: true, breaks: true, async: false });

    const tex = (i) => {
      const [t, display] = math[i];
      try {
        return katex.renderToString(t, { displayMode: display, throwOnError, strict });
      } catch (err) {
        if (throwOnError) throw err;
        return `<code class="tex-fallback">${t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</code>`;
      }
    };
    html = html
      .replace(/<p>\s*@@D(\d+)@@\s*<\/p>/g, (_, i) => `<div class="math-display">${tex(+i)}</div>`)
      .replace(/@@D(\d+)@@/g, (_, i) => `<div class="math-display">${tex(+i)}</div>`)
      .replace(/@@M(\d+)@@/g, (_, i) => tex(+i));
    return html;
  }

  root.renderMarkdown = renderMarkdown;
})(typeof module !== "undefined" && module.exports ? module.exports : window);
