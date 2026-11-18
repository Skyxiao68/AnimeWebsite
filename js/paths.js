// Secondary pages live in pages/, so a link written for one of them needs a
// prefix when the same code runs from index.html at the site root. index.html
// declares data-root="pages/"; every other page leaves it empty.
const root = document.documentElement.dataset.root || '';

export function pageHref(path) {
  return root + path;
}
