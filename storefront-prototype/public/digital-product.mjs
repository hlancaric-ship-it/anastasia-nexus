export function initDigitalProduct(root=document){
  for(const button of root.querySelectorAll('[data-digital-quantity]'))button.addEventListener('click',()=>{const input=button.closest('form').elements.quantity;const value=Number(input.value);input.value=String(Math.max(1,Math.min(99,(Number.isInteger(value)?value:1)+Number(button.dataset.digitalQuantity))));input.dispatchEvent(new Event('change',{bubbles:true}));});
  const image=root.querySelector('[data-vvv-main]');
  for(const button of root.querySelectorAll('[data-vvv-photo]'))button.addEventListener('click',()=>{const index=Number(button.dataset.vvvPhoto);image.src=index===0?'/assets/vvv-hero.avif':'/assets/vvv-thumb-'+(index+1)+'.avif';root.querySelectorAll('[data-vvv-photo]').forEach(b=>b.setAttribute('aria-current',String(b===button)));});
}
