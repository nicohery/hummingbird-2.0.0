{**
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 *}

{* Links to the combination's page; with JS (js/modules/miniature-add-to-cart.ts) a colour is
   chosen in the miniature instead, for adding to cart, unless the mode is legacy. *}
{foreach from=$variants item=variant}
  {$variantData = ['idAttribute' => (int) $variant.id_attribute, 'idProductAttribute' => (int) $variant.id_product_attribute, 'name' => $variant.name]}
  <a href="{$variant.url}"
    class="{$variant.type}"
    title="{$variant.name}"
    aria-label="{$variant.name} - {$product.name}"
    data-ps-action="miniature-choose-variant"
    data-ps-data="{$variantData|json_encode|escape:'html':'UTF-8'}"
    {if $variant.texture}style="background-image: url({$variant.texture})"{/if}
    {if $variant.html_color_code}style="background-color: {$variant.html_color_code}"{/if}
  ></a>
{/foreach}
