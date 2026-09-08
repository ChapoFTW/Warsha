/**
 * What "the page looks right" means, expressed as things a browser can measure.
 *
 * A 200 proves a server answered. It says nothing about a submit button pushed
 * off a 320px screen, an Arabic page rendering left-to-right, text spilling out
 * of a price card, or a control that exists in the DOM and does nothing. Those
 * are the defects Warsha has actually shipped, so those are what this measures.
 *
 * Every check returns evidence, not just a boolean, because "overflow detected"
 * is unactionable and "`.hero-cta` extends 42px past the viewport at 320px" is a
 * bug report.
 */

/** Console errors and page exceptions, attached before navigation. */
export function watchRuntime(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // A failed subresource logs both a console error and a network failure;
    // keeping the network one is enough and keeps the report readable.
    if (/Failed to load resource/i.test(text)) return;
    consoleErrors.push(text.slice(0, 300));
  });
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    // A navigation the test itself aborted is not a defect.
    if (/ERR_ABORTED/.test(failure)) return;
    failedRequests.push(`${request.method()} ${request.url().slice(0, 120)} — ${failure}`);
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    badResponses.push(`${status} ${response.url().slice(0, 120)}`);
  });

  return { consoleErrors, pageErrors, failedRequests, badResponses };
}

/**
 * Geometry problems, measured in the page.
 *
 * Horizontal overflow is the headline one: it is invisible on a desktop and
 * makes a phone scroll sideways, which is the single most common complaint
 * about a responsive layout.
 */
export async function measureLayout(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const viewportWidth = doc.clientWidth;
    const results = {
      viewportWidth,
      scrollWidth: doc.scrollWidth,
      horizontalOverflow: doc.scrollWidth - doc.clientWidth,
      offenders: [],
      clipped: [],
      tinyText: [],
      dir: doc.getAttribute('dir') || getComputedStyle(doc).direction,
      lang: doc.getAttribute('lang'),
    };

    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    for (const el of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;

      // Something sticking out of the viewport horizontally.
      if (box.right > viewportWidth + 1 || box.left < -1) {
        results.offenders.push({
          el: describe(el),
          left: Math.round(box.left),
          right: Math.round(box.right),
          overhang: Math.round(Math.max(box.right - viewportWidth, -box.left)),
          text: (el.textContent || '').trim().slice(0, 60),
        });
      }

      // Text taller than its own box: the classic "long label in a fixed row".
      if (el.children.length === 0 && (el.textContent || '').trim()) {
        if (el.scrollHeight > el.clientHeight + 2 && style.overflow === 'hidden') {
          results.clipped.push({ el: describe(el), text: (el.textContent || '').trim().slice(0, 60) });
        }
        const size = parseFloat(style.fontSize);
        if (size && size < 11) {
          results.tinyText.push({ el: describe(el), size, text: (el.textContent || '').trim().slice(0, 40) });
        }
      }
    }

    results.offenders = results.offenders.slice(0, 12);
    results.clipped = results.clipped.slice(0, 12);
    results.tinyText = results.tinyText.slice(0, 8);
    return results;
  });
}

/**
 * Are the things a person needs actually reachable and inside the screen?
 *
 * Warsha has shipped a control that rendered perfectly and did nothing, so
 * "present in the DOM" is not the bar. This reports position and enabled state
 * for the primary actions; the interaction test presses them.
 */
export async function findPrimaryActions(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const selector = 'button, a[href], [role="button"], input[type="submit"]';
    return [...document.querySelectorAll(selector)]
      .map((el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50),
          tag: el.tagName.toLowerCase(),
          href: el.getAttribute('href')?.slice(0, 80) ?? null,
          disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
          visible: style.display !== 'none' && style.visibility !== 'hidden',
          width: Math.round(box.width),
          height: Math.round(box.height),
          /*
           * Horizontally only, deliberately.
           *
           * The first version also required the control to be within the
           * viewport VERTICALLY, and promptly reported "34 controls outside the
           * viewport" on an 800x600 page — which is every control below the
           * fold on a page that scrolls, i.e. normal. A gate that flags normal
           * scrolling teaches everyone to ignore it.
           *
           * Escaping horizontally is the real defect: the page does not scroll
           * sideways, so a control past the right edge cannot be reached at all.
           */
          horizontallyInside: box.left >= -1 && box.right <= viewportWidth + 1,
          belowFold: box.top >= viewportHeight,
          // 44px is the widely used minimum touch target.
          touchTargetOk: box.height >= 40 || box.width === 0,
        };
      })
      .filter((a) => a.visible && a.label)
      .slice(0, 40);
  });
}

/** Tab through the page and report where focus actually lands. */
export async function probeKeyboard(page, steps = 12) {
  const order = [];
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        // A focus ring that is none/0 on all sides is invisible focus.
        hasVisibleFocus: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth || '0') > 0
          || style.boxShadow !== 'none',
        inViewport: box.top >= 0 && box.bottom <= document.documentElement.clientHeight + 1,
      };
    });
    if (focused) order.push(focused);
  }
  return order;
}
