/**
 * For the full copyright and license information, please view the
 * LICENSE.md file that was distributed with this source code.
 */

/**
 * Add to cart from a product miniature, for products with combinations and for stock.
 *
 * Without this, the miniature form posts the listing's id_product_attribute (the default
 * combination): the shopper never chooses a size or a colour, and gets one they did not pick.
 * The button also stays enabled once the last piece is in the cart (#927).
 *
 * The combination is chosen with the attribute inputs the product page uses, fetched from the
 * product controller's `refresh` action. They are posted as `group[id_attribute_group]`, which
 * the cart controller turns into the combination (Product::getIdProductAttributeByIdAttributes),
 * so the theme needs no combination table and any number of attribute groups works. The same
 * answer says whether the chosen combination and quantity can be ordered.
 *
 * Modes, from `data-ps-miniature-add-mode` on <body>, or the demo switch ?hb_miniature_mode=:
 * - legacy:    the historical behaviour, the default combination is added blindly
 * - quickview: a product with combinations opens its quickview, which has the full selector
 * - inline:    the selectors are shown inside the miniature, without a click: they are asked
 *              for when the miniature comes near the screen (the button reads Choose until then)
 * - drawer:    the selectors open in one shared bottom drawer, better on narrow screens
 */

import {Offcanvas} from 'bootstrap';
import parseData from '@helpers/parseData';

export type MiniatureAddMode = 'legacy' | 'quickview' | 'inline' | 'drawer';

export const MODES: MiniatureAddMode[] = ['legacy', 'quickview', 'inline', 'drawer'];
export const DEFAULT_MODE: MiniatureAddMode = 'inline';
const DEMO_STORAGE_KEY = 'hbMiniatureAddMode';

export interface MiniatureFormData {
  hasCombinations: boolean;
  name: string;
  chooseLabel: string;
  chooseAria: string;
  addLabel: string;
  addAria: string;
  unavailable: string;
}

export interface VariantLinkData {
  idAttribute: number;
  idProductAttribute: number;
  name: string;
}

export interface RefreshResponse {
  product_variants: string;
  product_add_to_cart: string;
  product_cover_thumbnails: string;
  product_prices?: string;
  id_product_attribute: number;
  product_minimal_quantity: number;
}

interface CartLine {
  id_product: string | number;
  id_product_attribute: string | number;
  cart_quantity?: string | number;
  quantity?: string | number;
}

interface UpdateCartEvent {
  reason?: {linkAction?: string; idProduct?: string | number};
  resp?: {cart?: {products?: CartLine[]}};
}

const formDataValidator: Validator<MiniatureFormData> = (data): data is MiniatureFormData => (
  typeof data === 'object' && data !== null
  && typeof (data as MiniatureFormData).hasCombinations === 'boolean'
  && typeof (data as MiniatureFormData).name === 'string'
);

const variantLinkValidator: Validator<VariantLinkData> = (data): data is VariantLinkData => (
  typeof data === 'object' && data !== null
  && typeof (data as VariantLinkData).idAttribute === 'number'
  && typeof (data as VariantLinkData).idProductAttribute === 'number'
);

const isMode = (value: string | null | undefined): value is MiniatureAddMode => (
  !!value && (MODES as string[]).includes(value)
);

/** The mode: the demo switch in the URL first, then what this browser remembered, then the page. */
export const resolveMode = (search: string, stored: string | null, fromPage: string | undefined): MiniatureAddMode => {
  const asked = new URLSearchParams(search).get('hb_miniature_mode');

  if (isMode(asked)) {
    return asked;
  }
  if (isMode(stored)) {
    return stored;
  }

  return isMode(fromPage) ? fromPage : DEFAULT_MODE;
};

const parseHtml = (html: string): HTMLDivElement => {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  return wrapper;
};

/** Whether the product page would let this combination and quantity be added, and what it says. */
export const readAvailability = (addToCartHtml: string): {orderable: boolean; message: string; node: HTMLElement | null} => {
  const {Theme: {selectors}} = window;
  const markup = parseHtml(addToCartHtml);
  const button = markup.querySelector<HTMLButtonElement>(selectors.addToCartButton);
  const message = markup.querySelector<HTMLElement>(selectors.product.productAvailability);

  return {
    orderable: !!button && !button.disabled,
    message: (message?.textContent || '').replace(/\s+/g, ' ').trim(),
    node: message,
  };
};

/**
 * The attribute inputs of the product page, made safe for a listing: the root loses the
 * product page hooks (the core JS refreshes a product page whenever an input inside
 * `.product-variants` / `.js-product-variants` changes), and every id gets a prefix so the
 * same product can be listed twice on one page.
 */
export const variantsFragment = (variantsHtml: string, prefix: string): DocumentFragment => {
  const markup = parseHtml(variantsHtml);
  const root = markup.firstElementChild;

  if (root) {
    root.classList.remove('product__variants', 'js-product-variants', 'product-variants');
    root.classList.add('product-miniature__choice');
  }

  markup.querySelectorAll<HTMLElement>('[id]').forEach((element) => {
    const oldId = element.id;
    const newId = `${prefix}-${oldId}`;
    markup.querySelectorAll(`[for="${oldId}"]`).forEach((label) => label.setAttribute('for', newId));
    markup.querySelectorAll(`[aria-labelledby="${oldId}"]`).forEach((ref) => ref.setAttribute('aria-labelledby', newId));
    markup.querySelectorAll(`[aria-describedby="${oldId}"]`).forEach((ref) => ref.setAttribute('aria-describedby', newId));
    element.id = newId;
  });

  const fragment = document.createDocumentFragment();
  fragment.append(...Array.from(markup.childNodes));

  return fragment;
};

/**
 * In a miniature, the colour swatches above already choose the colour group: its inputs stay in
 * the form, so they are posted, but the fieldset is hidden so the choice is not shown twice.
 */
export const hideGroupsDrivenBySwatches = (container: ParentNode, swatchAttributeIds: number[]): number => {
  let hidden = 0;

  container.querySelectorAll<HTMLFieldSetElement>('fieldset').forEach((fieldset) => {
    const values = Array.from(fieldset.querySelectorAll<HTMLInputElement | HTMLOptionElement>('input[name], option'))
      .filter((el) => el instanceof HTMLOptionElement || el.name.startsWith('group['))
      .map((el) => Number(el.value));

    if (values.some((value) => swatchAttributeIds.includes(value))) {
      fieldset.hidden = true;
      hidden += 1;
    }
  });

  return hidden;
};

export default function initMiniatureAddToCart(): void {
  const {prestashop, Theme: {events, selectors}} = window;
  const map = selectors.miniatureAddToCart;
  let stored: string | null = null;

  try {
    stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
  } catch {
    stored = null;
  }

  const mode = resolveMode(window.location.search, stored, document.body.dataset.psMiniatureAddMode);

  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, mode);
  } catch {
    // private browsing: the mode applies to this page only
  }

  document.body.dataset.psMiniatureAddModeActive = mode;

  if (mode === 'legacy') {
    return;
  }

  const formData = (form: HTMLFormElement): MiniatureFormData | null => parseData<MiniatureFormData>(form, formDataValidator);
  const input = (form: HTMLFormElement, name: string): HTMLInputElement | null => form.querySelector<HTMLInputElement>(`input[name="${name}"]`);

  // Resolves once the form is no longer waiting for an answer.
  const whenReady = (form: HTMLFormElement): Promise<void> => new Promise((resolve) => {
    if (form.dataset.psState !== 'loading') {
      resolve();

      return;
    }
    const observer = new MutationObserver(() => {
      if (form.dataset.psState !== 'loading') {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(form, {attributes: true, attributeFilter: ['data-ps-state']});
  });

  const refresh = async (form: HTMLFormElement, quantity?: number, idProductAttribute?: number): Promise<RefreshResponse> => {
    const params = new URLSearchParams();
    params.append('id_product', input(form, 'id_product')?.value || '');
    params.append('ajax', '1');
    params.append('action', 'refresh');
    params.append('quantity_wanted', String(quantity ?? (input(form, 'qty')?.value || '1')));

    // A starting combination (a colour swatch): the product page resolves it without groups.
    if (idProductAttribute) {
      params.append('id_product_attribute', String(idProductAttribute));
    }

    if (!idProductAttribute) {
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`${map.variants} [name^="group["]`).forEach((field) => {
        if (field instanceof HTMLInputElement && field.type === 'radio' && !field.checked) {
          return;
        }
        params.append(field.name, field.value);
      });
    }

    const resp = await fetch(prestashop.urls.pages.product as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
      body: params,
      credentials: 'same-origin',
    });

    if (!resp.ok) {
      throw new Error(`Miniature refresh failed: ${resp.status}`);
    }

    return resp.json() as Promise<RefreshResponse>;
  };

  const swatchesOf = (form: HTMLFormElement): {link: HTMLElement; data: VariantLinkData}[] => {
    const miniature = form.closest<HTMLElement>(selectors.product.miniature);

    if (!miniature) {
      return [];
    }

    return Array.from(miniature.querySelectorAll<HTMLElement>(map.variantLink))
      .map((link) => ({link, data: parseData<VariantLinkData>(link, variantLinkValidator)}))
      .filter((s): s is {link: HTMLElement; data: VariantLinkData} => s.data !== null);
  };

  // The swatch of the chosen colour is marked as pressed.
  const markSwatches = (form: HTMLFormElement): void => {
    const chosen = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`${map.variants} [name^="group["]`))
      .filter((field) => !(field instanceof HTMLInputElement && field.type === 'radio' && !field.checked))
      .map((field) => Number(field.value));

    swatchesOf(form).forEach(({link, data}) => {
      link.setAttribute('aria-pressed', chosen.includes(data.idAttribute) ? 'true' : 'false');
    });
  };

  // Where the availability is said, tied to the quantity field and the button.
  const statusOf = (form: HTMLFormElement): HTMLElement => {
    let status = form.querySelector<HTMLElement>(map.availability);

    if (!status) {
      status = document.createElement('p');
      status.className = 'product-miniature__availability';
      status.dataset.psTarget = map.availabilityName;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      (form.querySelector<HTMLElement>(map.variants) || form).append(status);
    }
    if (!status.id) {
      status.id = `${form.querySelector<HTMLElement>(map.variants)?.dataset.psPrefix || `m${Math.random().toString(36).slice(2, 8)}`}-availability`;
    }
    [input(form, 'qty'), form.querySelector<HTMLButtonElement>(selectors.addToCartButton)].forEach((el) => {
      if (el && !(el.getAttribute('aria-describedby') || '').split(' ').includes(status!.id)) {
        el.setAttribute('aria-describedby', `${el.getAttribute('aria-describedby') || ''} ${status!.id}`.trim());
      }
    });

    return status;
  };

  // Same rules as the product page (core product.js): the button and the messages come from the
  // refresh answer, and a new combination starts at its minimal quantity.
  const applyState = (form: HTMLFormElement, data: RefreshResponse, newCombination = false): void => {
    const {orderable, node} = readAvailability(data.product_add_to_cart);
    const minimal = parseHtml(data.product_add_to_cart).querySelector<HTMLElement>(map.minimalQuantity);
    const button = form.querySelector<HTMLButtonElement>(selectors.addToCartButton);
    const status = statusOf(form);
    const ipa = input(form, 'id_product_attribute');
    const qty = input(form, 'qty');

    if (ipa && data.id_product_attribute) {
      ipa.value = String(data.id_product_attribute);
    }
    if (qty && data.product_minimal_quantity) {
      qty.min = String(data.product_minimal_quantity);
      if (newCombination) {
        qty.value = String(data.product_minimal_quantity);
      }
    }
    if (button) {
      button.disabled = !orderable;
      if (orderable) {
        button.removeAttribute('aria-disabled');
      } else {
        button.setAttribute('aria-disabled', 'true');
      }
    }
    if (status) {
      // The product page's own availability block: its icon stays aria-hidden and its
      // "Product availability:" prefix stays for screen readers only.
      if (node) {
        node.removeAttribute('data-ps-ref');
        node.removeAttribute('aria-live');
        status.replaceChildren(node);
      } else {
        status.textContent = orderable ? '' : (formData(form)?.unavailable || '');
      }
      if (minimal && !minimal.hidden) {
        minimal.removeAttribute('data-ps-ref');
        status.append(minimal);
      }
      status.dataset.psState = orderable ? 'available' : 'unavailable';
    }
  };

  // The inputs come back from the product page with the choice applied: its "Size: M" labels
  // and its disabled options follow, and focus stays on the field that was just used.
  const renderVariants = (panel: HTMLElement, data: RefreshResponse): void => {
    const active = document.activeElement as HTMLInputElement | HTMLSelectElement | null;
    const focusName = active && panel.contains(active) ? active.name : null;
    const focusValue = active instanceof HTMLInputElement && active.type === 'radio' ? active.value : null;
    const prefix = panel.dataset.psPrefix || `m${Math.random().toString(36).slice(2, 8)}`;
    panel.dataset.psPrefix = prefix;

    const status = panel.querySelector<HTMLElement>(map.availability);
    panel.replaceChildren(variantsFragment(data.product_variants, prefix));

    if (status) {
      panel.append(status);
    }

    const form = panel.closest<HTMLFormElement>(map.form);

    if (form) {
      hideGroupsDrivenBySwatches(panel, swatchesOf(form).map(({data: swatch}) => swatch.idAttribute));
      markSwatches(form);
    }

    if (focusName) {
      const selector = focusValue ? `[name="${focusName}"][value="${focusValue}"]` : `[name="${focusName}"]`;
      panel.querySelector<HTMLElement>(selector)?.focus();
    }
  };

  // In a miniature, the price follows the chosen combination (a combination can change it).
  const swapPrice = (form: HTMLFormElement, data: RefreshResponse): void => {
    const miniature = form.closest<HTMLElement>(selectors.product.miniature);
    const prices = parseHtml(data.product_prices || '');
    const textOf = (node: Element | null): string | null => {
      if (!node) {
        return null;
      }
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.visually-hidden').forEach((hidden) => hidden.remove());

      return (copy.textContent || '').replace(/\s+/g, ' ').trim();
    };
    const price = miniature?.querySelector<HTMLElement>(map.price);
    const newPrice = textOf(prices.querySelector(map.productPrice));

    // A module's custom price (displayProductPriceBlock) is left alone.
    if (price && newPrice && !price.firstElementChild) {
      price.textContent = newPrice;
    }
    const regular = miniature?.querySelector<HTMLElement>(map.regularPrice);

    if (regular) {
      const newRegular = textOf(prices.querySelector(map.productRegularPrice));
      regular.hidden = !newRegular;
      if (newRegular) {
        regular.textContent = newRegular;
      }
    }
  };

  // In a miniature, the picture follows the chosen combination.
  const swapImage = (form: HTMLFormElement, data: RefreshResponse): void => {
    const miniature = form.closest<HTMLElement>(selectors.product.miniature);
    const current = miniature?.querySelector<HTMLElement>(map.image);
    const cover = parseHtml(data.product_cover_thumbnails).querySelector<HTMLElement>(map.coverPicture);

    if (!current || !cover) {
      return;
    }

    const oldImg = current.querySelector<HTMLImageElement>('img');
    const newImg = cover.querySelector<HTMLImageElement>('img');

    if (!oldImg || !newImg) {
      return;
    }

    newImg.className = oldImg.className;
    newImg.width = oldImg.width;
    newImg.height = oldImg.height;
    newImg.removeAttribute('fetchpriority');
    newImg.loading = 'lazy';
    cover.removeAttribute('data-ps-ref');
    cover.dataset.psTarget = current.dataset.psTarget || '';
    current.replaceWith(cover);
  };

  const update = async (form: HTMLFormElement, newCombination = false): Promise<void> => {
    form.dataset.psState = 'loading';
    form.dataset.psQuantity = input(form, 'qty')?.value || '';
    form.setAttribute('aria-busy', 'true');
    try {
      const data = await refresh(form);
      const panel = form.querySelector<HTMLElement>(map.variants);

      if (panel && !panel.hidden) {
        renderVariants(panel, data);
        swapImage(form, data);
        swapPrice(form, data);
      }
      applyState(form, data, newCombination);
    } finally {
      form.dataset.psState = 'ready';
      form.removeAttribute('aria-busy');
    }
  };

  const openVariants = async (form: HTMLFormElement, idProductAttribute?: number): Promise<void> => {
    const panel = form.querySelector<HTMLElement>(map.variants);

    if (!panel) {
      return;
    }

    form.setAttribute('aria-busy', 'true');
    const data = await refresh(form, undefined, idProductAttribute).finally(() => form.removeAttribute('aria-busy'));
    renderVariants(panel, data);
    panel.hidden = false;
    form.dataset.psState = 'ready';
    swapImage(form, data);
    swapPrice(form, data);
    applyState(form, data, true);
  };

  // A product with combinations is chosen first, then added. Run again when the list is replaced.
  const prepare = (): void => document.querySelectorAll<HTMLFormElement>(map.form).forEach((form) => {
    const data = formData(form);
    const label = form.querySelector<HTMLElement>(map.addLabel);
    const button = form.querySelector<HTMLButtonElement>(selectors.addToCartButton);

    if (!data?.hasCombinations || form.closest(map.drawer)) {
      return;
    }
    if (label) {
      label.textContent = data.chooseLabel;
    }
    if (button) {
      button.setAttribute('aria-label', data.chooseAria);
      button.title = data.chooseAria;
      const panel = form.querySelector<HTMLElement>(map.variants);
      const drawer = document.querySelector<HTMLElement>(map.drawer);

      if (mode === 'inline' && panel) {
        panel.id = panel.id || `${(panel.dataset.psPrefix = `m${Math.random().toString(36).slice(2, 8)}`)}-variants`;
        button.setAttribute('aria-controls', panel.id);
        button.setAttribute('aria-expanded', 'false');
      } else if (mode === 'drawer' && drawer) {
        button.setAttribute('aria-controls', drawer.id);
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
      } else if (mode === 'quickview') {
        button.setAttribute('aria-haspopup', 'dialog');
      }
    }

    // Swatches become toggle buttons for the colour of the add to cart.
    form.closest<HTMLElement>(selectors.product.miniature)?.querySelectorAll<HTMLElement>(map.variantLink).forEach((link) => {
      link.setAttribute('role', 'button');
      link.setAttribute('aria-pressed', 'false');
    });
  });

  prepare();
  // The faceted search replaces the list after its own listener has run.
  prestashop.on(events.updateProductList, () => window.setTimeout(prepare, 0));
  prestashop.on(events.updateProductList, () => window.setTimeout(showInline, 0));

  // Where the choice is made depends on the mode; a swatch gives the combination to start from.
  const openChooser = async (form: HTMLFormElement, data: MiniatureFormData, idProductAttribute?: number): Promise<void> => {
    const miniature = form.closest<HTMLElement>(selectors.product.miniature);
    const button = form.querySelector<HTMLButtonElement>(selectors.addToCartButton);

    if (mode === 'quickview' && miniature) {
      if (idProductAttribute) {
        miniature.dataset.idProductAttribute = String(idProductAttribute);
      }
      prestashop.emit(events.clickQuickview, miniature);

      return;
    }

    const drawerElement = document.querySelector<HTMLElement>(map.drawer);
    const drawerForm = drawerElement?.querySelector<HTMLFormElement>(map.form);

    if (mode === 'drawer' && drawerElement && drawerForm) {
      ['id_product', 'id_product_attribute', 'qty'].forEach((name) => {
        const field = input(drawerForm, name);

        if (field) {
          field.value = input(form, name)?.value || (name === 'qty' ? '1' : '0');
        }
      });
      const title = drawerElement.querySelector<HTMLElement>(map.drawerTitle);

      if (title) {
        title.textContent = data.name;
      }
      // The drawer's quantity field and button take the labels of the miniature that opened it.
      [selectors.qtyInput.decrement, selectors.qtyInput.increment, 'input[name="qty"]'].forEach((selector) => {
        const label = form.querySelector<HTMLElement>(selector)?.getAttribute('aria-label');

        if (label) {
          drawerForm.querySelector<HTMLElement>(selector)?.setAttribute('aria-label', label);
        }
      });
      drawerForm.querySelector<HTMLElement>(selectors.addToCartButton)?.setAttribute('aria-label', data.addAria);
      drawerElement.dataset.psOpener = input(form, 'id_product')?.value || '';
      button?.setAttribute('aria-expanded', 'true');
      Offcanvas.getOrCreateInstance(drawerElement).show();
      await openVariants(drawerForm, idProductAttribute);

      return;
    }

    if (button) {
      button.disabled = true;
    }
    form.dataset.psState = 'loading';
    await openVariants(form, idProductAttribute);
    button?.setAttribute('aria-expanded', 'true');
    const label = form.querySelector<HTMLElement>(map.addLabel);

    if (label) {
      label.textContent = data.addLabel;
    }
    button?.setAttribute('aria-label', data.addAria);
    if (button) {
      button.title = data.addAria;
    }
  };

  // Inline: the choices of every product with combinations are shown without a click, asked
  // for when its miniature comes near the screen, so a long list does not ask for all at once.
  const showOne = (form: HTMLFormElement): void => {
    const data = formData(form);

    if (data?.hasCombinations && !form.dataset.psState && !form.closest(map.drawer)) {
      openChooser(form, data).catch(() => undefined);
    }
  };
  // The whole miniature is watched, not the form at its bottom: the choices load as the card shows.
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((entry) => {
    const form = entry.target.matches(map.form) ? entry.target as HTMLFormElement : entry.target.querySelector<HTMLFormElement>(map.form);

    if (entry.isIntersecting && form) {
      observer?.unobserve(entry.target);
      showOne(form);
    }
  }), {rootMargin: '200px'}) : null;
  function showInline(): void {
    if (mode !== 'inline') {
      return;
    }
    document.querySelectorAll<HTMLFormElement>(map.form).forEach((form) => {
      const target = form.closest<HTMLElement>(selectors.product.miniature) || form;

      if (observer) {
        observer.observe(target);
      } else {
        showOne(form);
      }
    });
  }
  showInline();

  // Capture phase: runs before the core add-to-cart handler, delegated on body.
  document.addEventListener('click', async (event: MouseEvent) => {
    const target = event.target as HTMLElement;

    // A colour swatch chooses the colour here instead of leaving for the product page.
    const link = target.closest<HTMLElement>(map.variantLink);

    if (link) {
      const miniature = link.closest<HTMLElement>(selectors.product.miniature);
      const form = miniature?.querySelector<HTMLFormElement>(map.form);
      const formInfo = form ? formData(form) : null;
      const swatch = parseData<VariantLinkData>(link, variantLinkValidator);

      if (!form || !formInfo?.hasCombinations || !swatch) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      // Clicked while the choices are loading: the colour applies once they are there.
      await whenReady(form);

      if (form.dataset.psState === 'ready' && mode === 'inline') {
        const value = swatch.idAttribute;
        const field = form.querySelector<HTMLInputElement | HTMLSelectElement>(
          `${map.variants} input[name^="group["][value="${value}"], ${map.variants} select[name^="group["]:has(option[value="${value}"])`,
        );

        if (field instanceof HTMLInputElement) {
          field.checked = true;
        } else if (field) {
          field.value = String(swatch.idAttribute);
        }
        await update(form, true);

        return;
      }
      if (form.dataset.psState !== 'loading') {
        await openChooser(form, formInfo, swatch.idProductAttribute);
      }

      return;
    }

    const button = target.closest<HTMLButtonElement>(selectors.addToCartButton);
    const form = button?.closest<HTMLFormElement>(map.form);
    const data = form ? formData(form) : null;

    if (!button || !form || !data?.hasCombinations || form.dataset.psState === 'ready' || form.dataset.psState === 'loading') {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    await openChooser(form, data);
    form.querySelector<HTMLElement>(`${map.variants} select, ${map.variants} input:not([type="hidden"])`)?.focus();
  }, true);

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    const link = (event.target as HTMLElement).closest<HTMLElement>(`${map.variantLink}[role="button"]`);

    if (link && (event.key === ' ' || event.key === 'Spacebar')) {
      event.preventDefault();
      link.click();
    }
  });

  // A product without combinations has no panel to open: its quantity is checked as typed.
  const canUpdate = (form: HTMLFormElement): boolean => form.dataset.psState === 'ready'
    || (!formData(form)?.hasCombinations && !form.dataset.psState);

  // A changed attribute asks the product page again, as a new combination. Changed while an
  // answer is loading, it would be replaced by that answer: the last choice is applied after it.
  document.addEventListener('change', async (event: Event) => {
    const field = event.target as HTMLInputElement | HTMLSelectElement;
    const form = field.closest<HTMLFormElement>(map.form);

    if (!form || !field.matches('[name^="group["]')) {
      return;
    }
    if (form.dataset.psState === 'loading') {
      form.dataset.psQueued = JSON.stringify([field.name, field.value]);
      await whenReady(form);
      const queued = form.dataset.psQueued;

      if (!queued) {
        return;
      }
      delete form.dataset.psQueued;
      const [name, value] = JSON.parse(queued) as [string, string];
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`${map.variants} [name="${name}"]`).forEach((again) => {
        if (again instanceof HTMLInputElement && again.type === 'radio') {
          again.checked = again.value === value;
        } else {
          again.value = value;
        }
      });
    }
    if (canUpdate(form)) {
      update(form, true).catch(() => undefined);
    }
  });

  // A changed quantity too, like the product page: the +/- buttons and the arrow keys change the
  // value without a change event, so input, clicks and blur are watched, debounced per form.
  const timers = new WeakMap<HTMLFormElement, number>();
  const quantityChanged = (event: Event): void => {
    const target = event.target as HTMLElement;
    const form = target.closest<HTMLFormElement>(map.form);
    const isQty = target.matches('input[name="qty"]')
      || !!target.closest(`${selectors.qtyInput.increment}, ${selectors.qtyInput.decrement}`);

    // Only a quantity that differs from the last one asked: leaving the field for the add
    // button must not race the recheck made after the add.
    if (!form || !isQty || !canUpdate(form) || input(form, 'qty')?.value === form.dataset.psQuantity) {
      return;
    }
    window.clearTimeout(timers.get(form));
    timers.set(form, window.setTimeout(() => update(form).catch(() => undefined), 500));
  };
  document.addEventListener('input', quantityChanged);
  document.addEventListener('click', quantityChanged);
  document.addEventListener('focusout', quantityChanged);

  // After an add, ask again with what is now in the cart, for every product with or without
  // combinations, so the last piece cannot be added twice from the same miniature (#927).
  prestashop.on(events.updateCart, (event: UpdateCartEvent) => {
    if (event?.reason?.linkAction !== 'add-to-cart') {
      return;
    }

    const lines = event.resp?.cart?.products || [];
    const idProduct = String(event.reason.idProduct ?? '');

    document.querySelectorAll<HTMLFormElement>(map.form).forEach((form) => {
      if (input(form, 'id_product')?.value !== idProduct) {
        return;
      }
      const ipa = input(form, 'id_product_attribute')?.value || '0';
      const line = lines.find((l) => String(l.id_product) === idProduct && String(l.id_product_attribute) === ipa);
      const inCart = Number(line?.cart_quantity ?? line?.quantity ?? 0);
      const wanted = Number(input(form, 'qty')?.value || '1');

      refresh(form, inCart + wanted).then((data) => {
        // The core add-to-cart handler re-enables its button one second after every add.
        window.setTimeout(() => applyState(form, data), 1100);
      }).catch(() => undefined);
    });

    const drawerElement = document.querySelector<HTMLElement>(map.drawer);

    if (drawerElement?.classList.contains('show')) {
      Offcanvas.getOrCreateInstance(drawerElement).hide();
    }
  });

  // The drawer is shared: clear it on close and give focus back to the miniature that opened it.
  document.querySelector<HTMLElement>(map.drawer)?.addEventListener('hidden.bs.offcanvas', (event: Event) => {
    const drawerElement = event.currentTarget as HTMLElement;
    drawerElement.querySelector<HTMLElement>(map.variants)?.replaceChildren();
    const opener = document.querySelector<HTMLElement>(
      `${selectors.product.miniature}[data-id-product="${drawerElement.dataset.psOpener}"] ${selectors.addToCartButton}`,
    );
    opener?.setAttribute('aria-expanded', 'false');
    opener?.focus();
  });
}
