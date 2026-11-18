/*
 * js/theme.js - light/dark switch.
 *
 * A one-line script in each page's <head> reads the saved mode before the
 * stylesheets, so a light page does not paint dark first. This module handles
 * the button: label it for the theme it switches to, then save the choice.
 * Dark is the default. We do not follow the OS setting.
 */
const KEY = 'mf.theme';
const root = document.documentElement;

/** True when the light theme is on. */
export function isLight() {
  return root.dataset.theme === 'light';
}

/** Apply one mode and reflect it on every toggle button on the page. */
export function setTheme(light) {
  if (light) root.dataset.theme = 'light';
  else delete root.dataset.theme;

  try {
    localStorage.setItem(KEY, light ? 'light' : 'dark');
  } catch (err) {
    /* Private mode: the switch works for this page but will not be remembered. */
  }

  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    const next = light ? 'dark' : 'light';
    button.setAttribute('aria-pressed', String(light));
    button.setAttribute('aria-label', `Switch to ${next} theme`);
    button.title = `${next === 'light' ? 'Light' : 'Dark'} theme`;
  }
}

for (const button of document.querySelectorAll('[data-theme-toggle]')) {
  button.addEventListener('click', () => setTheme(!isLight()));
}

/* Two tabs open on the same site stay in step without a reload. */
window.addEventListener('storage', (event) => {
  if (event.key === KEY) setTheme(event.newValue === 'light');
});

/* Label the buttons for whatever the head script already applied. */
setTheme(isLight());
