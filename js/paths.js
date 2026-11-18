// Secondary pages live in pages/. A link written for one of them needs a
// prefix when the same code runs from index.html at the site root.
// index.html sets data-root="pages/"; other pages leave it empty.
const root = document.documentElement.dataset.root || '';

export function pageHref(path) {
  return root + path;
}
