{**
 * For the full copyright and license information, please view the
 * LICENSE.md file that was distributed with this source code.
 *}
{* One drawer shared by every miniature: the attribute inputs are loaded into it on demand. *}
{capture assign='drawerUnavailable'}{l s='This combination is not available.' d='Shop.Theme.Catalog'}{/capture}
{capture assign='drawerAddLabel'}{l s='Add to cart' d='Shop.Theme.Actions'}{/capture}
{$drawerData = [
  'hasCombinations' => true,
  'name' => '',
  'chooseLabel' => $drawerAddLabel,
  'chooseAria' => $drawerAddLabel,
  'addLabel' => $drawerAddLabel,
  'addAria' => $drawerAddLabel,
  'unavailable' => $drawerUnavailable
]}
<div
  class="offcanvas offcanvas-bottom product-miniature-drawer"
  id="miniatureVariantsDrawer"
  tabindex="-1"
  aria-labelledby="miniatureVariantsDrawerTitle"
  data-ps-ref="miniature-variants-drawer"
>
  <div class="offcanvas-header">
    <p class="h5 offcanvas-title mb-0" id="miniatureVariantsDrawerTitle" data-ps-target="miniature-drawer-title"></p>
    <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="{l s='Close' d='Shop.Theme.Global'}"></button>
  </div>
  <div class="offcanvas-body">
    <form
      class="product-miniature-drawer__form"
      action="{$urls.pages.cart}"
      method="post"
      data-ps-component="miniature-add-to-cart"
      data-ps-data="{$drawerData|json_encode|escape:'html':'UTF-8'}"
    >
      <input type="hidden" name="id_product" value="">
      <input type="hidden" name="id_product_attribute" value="">
      <input type="hidden" name="token" value="{$static_token}">
      <div class="product-miniature-drawer__variants" data-ps-target="miniature-variants"></div>
      <div class="product-miniature-drawer__actions">
        {* The quantity field of the product page; its labels take the product name when the drawer opens *}
        <div class="product-miniature-drawer__qty quantity-button js-quantity-button">
          {include file='components/qty-input.tpl'
            product=['id_product' => 'drawer', 'name' => '']
            attributes=[
              "id" => "miniatureVariantsDrawerQty",
              "value" => "1",
              "min" => "1"
            ]
          }
        </div>
        <button
          type="button"
          class="btn btn-primary product-miniature-drawer__add"
          data-button-action="add-to-cart"
          data-ps-ref="add-to-cart"
          aria-label="{$drawerAddLabel}"
        >
          <i class="material-icons" aria-hidden="true">&#xE547;</i>
          {$drawerAddLabel}
        </button>
      </div>
    </form>
  </div>
</div>
