/**
 * For the full copyright and license information, please view the
 * LICENSE.md file that was distributed with this source code.
 */
import selectorsMap from '@constants/selectors-map';
import {
  DEFAULT_MODE, hideGroupsDrivenBySwatches, readAvailability, resolveMode, variantsFragment,
} from './miniature-add-to-cart';

beforeAll(() => {
  window.Theme = {
    ...window.Theme,
    selectors: selectorsMap,
  };
});

describe('resolveMode', () => {
  it('takes the demo switch in the URL first', () => {
    expect(resolveMode('?hb_miniature_mode=drawer', 'quickview', 'legacy')).toBe('drawer');
  });

  it('then what the browser remembered, then the page', () => {
    expect(resolveMode('', 'quickview', 'legacy')).toBe('quickview');
    expect(resolveMode('', null, 'legacy')).toBe('legacy');
  });

  it('ignores unknown values and falls back to the default', () => {
    expect(resolveMode('?hb_miniature_mode=nope', 'other', undefined)).toBe(DEFAULT_MODE);
  });
});

describe('readAvailability', () => {
  it('is orderable when the product page button is enabled', () => {
    const html = `
      <div data-ps-ref="product-availability">  In stock </div>
      <button data-ps-ref="add-to-cart" data-button-action="add-to-cart">Add</button>`;

    expect(readAvailability(html)).toMatchObject({orderable: true, message: 'In stock'});
  });

  it('is not orderable when the product page button is disabled', () => {
    const html = `
      <div data-ps-ref="product-availability">There are not enough products in stock</div>
      <button data-ps-ref="add-to-cart" disabled>Add</button>`;

    expect(readAvailability(html)).toMatchObject({orderable: false, message: 'There are not enough products in stock'});
  });

  it('is not orderable when there is no button at all', () => {
    expect(readAvailability('<p>Out of stock</p>').orderable).toBe(false);
  });
});

describe('variantsFragment', () => {
  const html = `
    <div class="product__variants js-product-variants">
      <fieldset class="product-variant">
        <legend id="group_1_legend">Size</legend>
        <select id="group_1" name="group[1]" aria-labelledby="group_1_legend">
          <option value="1" selected>S</option><option value="2">M</option>
        </select>
        <input type="radio" id="radio_8" name="group[2]" value="8" checked>
        <label for="radio_8">White</label>
      </fieldset>
    </div>`;

  it('drops the product page hooks the core JS listens to', () => {
    const root = document.createElement('div');
    root.append(variantsFragment(html, 'p1'));
    const top = root.firstElementChild as HTMLElement;

    expect(top.classList.contains('js-product-variants')).toBe(false);
    expect(top.classList.contains('product__variants')).toBe(false);
    expect(top.classList.contains('product-miniature__choice')).toBe(true);
  });

  it('keeps the group[] names the cart controller resolves', () => {
    const root = document.createElement('div');
    root.append(variantsFragment(html, 'p1'));

    expect(Array.from(root.querySelectorAll('[name]')).map((el) => el.getAttribute('name'))).toEqual(['group[1]', 'group[2]']);
  });

  it('prefixes ids and keeps labels pointing at them', () => {
    const root = document.createElement('div');
    root.append(variantsFragment(html, 'p1'));

    expect(root.querySelector('select')?.id).toBe('p1-group_1');
    expect(root.querySelector('select')?.getAttribute('aria-labelledby')).toBe('p1-group_1_legend');
    expect(root.querySelector('label')?.getAttribute('for')).toBe('p1-radio_8');
  });
});

describe('hideGroupsDrivenBySwatches', () => {
  it('hides the colour group the swatches drive and keeps its inputs', () => {
    document.body.innerHTML = `
      <div id="panel">
        <fieldset id="size"><select name="group[1]"><option value="1">S</option><option value="2">M</option></select></fieldset>
        <fieldset id="color"><input type="radio" name="group[2]" value="8" checked><input type="radio" name="group[2]" value="11"></fieldset>
      </div>`;
    const panel = document.getElementById('panel') as HTMLElement;

    expect(hideGroupsDrivenBySwatches(panel, [8, 11])).toBe(1);
    expect((document.getElementById('color') as HTMLFieldSetElement).hidden).toBe(true);
    expect((document.getElementById('size') as HTMLFieldSetElement).hidden).toBe(false);
    expect(panel.querySelectorAll('[name="group[2]"]').length).toBe(2);
  });

  it('hides nothing when the product has no swatch', () => {
    document.body.innerHTML = '<div id="p"><fieldset><select name="group[1]"><option value="1">S</option></select></fieldset></div>';

    expect(hideGroupsDrivenBySwatches(document.getElementById('p') as HTMLElement, [])).toBe(0);
  });
});
