/**
 * KidFirst CC Checkout Flow
 * Handles: physical/digital selector, variant picking, T&C, add-to-cart
 */

'use strict';

/* ---- CC Checkout Flow Custom Element ---- */

class CCCheckoutFlow extends HTMLElement {
  constructor() {
    super();
    this.productHandle = this.dataset.productHandle;
    this.offersPhysical = this.dataset.offersPhysical !== 'false';
    this.offersDigital = this.dataset.offersDigital === 'true';
    this.productData = null;
    this.selectedOptions = {};
    this.selectedVariant = null;
  }

  async connectedCallback() {
    await this.fetchProductData();
    this.initOptions();
    this.updateVariant();
    this.bindEvents();
    this.updateFormatUI();
  }

  /* --- Data --- */

  async fetchProductData() {
    if (!this.productHandle) return;
    try {
      const res = await fetch(`/products/${this.productHandle}.js`);
      if (!res.ok) throw new Error(`${res.status}`);
      this.productData = await res.json();
    } catch (err) {
      console.warn('[CC] Could not load product data:', err);
    }
  }

  initOptions() {
    if (!this.productData) return;
    // Pre-select first value for each option
    this.productData.options.forEach((name, i) => {
      const firstValue = this.productData.variants[0]?.[`option${i + 1}`];
      this.selectedOptions[name] = firstValue;
    });
  }

  updateVariant() {
    if (!this.productData) return;
    this.selectedVariant = this.productData.variants.find(v =>
      this.productData.options.every((name, i) =>
        v[`option${i + 1}`] === this.selectedOptions[name]
      )
    ) || null;

    // Update hidden input
    const idInput = this.querySelector('.cc-variant-id-input');
    if (idInput && this.selectedVariant) {
      idInput.value = this.selectedVariant.id;
    }

    this.syncOptionButtons();
    this.syncSelectedLabels();
    this.syncAddToCartBtn();
    this.syncPriceDisplay();
  }

  /* --- UI Sync --- */

  updateFormatUI() {
    if (this.offersPhysical && this.offersDigital) {
      // Show format selector only; hide both flows
      this.show('format-selector');
      this.hide('physical-flow');
      this.hide('digital-flow');
    } else if (this.offersDigital) {
      this.hide('format-selector');
      this.hide('physical-flow');
      this.show('digital-flow');
    } else {
      this.hide('format-selector');
      this.hide('digital-flow');
      this.show('physical-flow');
    }
  }

  show(sectionName) {
    const el = this.querySelector(`[data-section="${sectionName}"]`);
    el?.removeAttribute('hidden');
  }

  hide(sectionName) {
    const el = this.querySelector(`[data-section="${sectionName}"]`);
    el?.setAttribute('hidden', '');
  }

  syncOptionButtons() {
    if (!this.productData) return;

    this.querySelectorAll('.cc-variant-option').forEach(btn => {
      const optName = btn.dataset.optionName;
      const optValue = btn.dataset.optionValue;
      const optIndex = this.productData.options.indexOf(optName);

      // Is any variant available with this value (given other selections)?
      const available = this.productData.variants.some(v => {
        return (
          v[`option${optIndex + 1}`] === optValue &&
          v.available &&
          this.productData.options.every((name, i) => {
            if (name === optName) return true;
            return v[`option${i + 1}`] === this.selectedOptions[name];
          })
        );
      });

      btn.classList.toggle('selected', this.selectedOptions[optName] === optValue);
      btn.classList.toggle('unavailable', !available);
    });
  }

  syncSelectedLabels() {
    this.querySelectorAll('.cc-selected-value').forEach(el => {
      const optName = el.dataset.option;
      if (optName && this.selectedOptions[optName] !== undefined) {
        el.textContent = this.selectedOptions[optName];
      }
    });
  }

  syncAddToCartBtn() {
    const btn = this.querySelector('.cc-add-to-cart-btn:not(.cc-digital-checkout-btn)');
    if (!btn) return;

    if (!this.selectedVariant) {
      btn.disabled = true;
      btn.textContent = 'Unavailable';
    } else if (!this.selectedVariant.available) {
      btn.disabled = true;
      btn.textContent = 'Sold Out';
    } else {
      btn.disabled = false;
      btn.textContent = 'Add to Cart';
    }
  }

  syncPriceDisplay() {
    if (!this.selectedVariant) return;
    // Look for our price element in the details panel
    const priceEl = document.querySelector('.cc-product-details__price');
    if (!priceEl) return;

    const price = (this.selectedVariant.price / 100).toLocaleString('en-CA', {
      style: 'currency',
      currency: window.Shopify?.currency?.active || 'CAD',
    });

    const comparePrice = this.selectedVariant.compare_at_price;
    if (comparePrice && comparePrice > this.selectedVariant.price) {
      const compare = (comparePrice / 100).toLocaleString('en-CA', {
        style: 'currency',
        currency: window.Shopify?.currency?.active || 'CAD',
      });
      priceEl.innerHTML = `<span class="cc-price-sale">${price}</span> <s class="cc-price-compare">${compare}</s>`;
    } else {
      priceEl.textContent = price;
    }
  }

  /* --- Events --- */

  bindEvents() {
    // Format selector buttons
    this.querySelector('[data-action="select-physical"]')?.addEventListener('click', () => {
      this.hide('format-selector');
      this.show('physical-flow');
      this.hide('digital-flow');
    });

    this.querySelector('[data-action="select-digital"]')?.addEventListener('click', () => {
      this.hide('format-selector');
      this.hide('physical-flow');
      this.show('digital-flow');
    });

    // Variant option buttons (delegated)
    this.addEventListener('click', e => {
      const btn = e.target.closest('.cc-variant-option');
      if (!btn || btn.classList.contains('unavailable')) return;
      const { optionName, optionValue } = btn.dataset;
      if (optionName) {
        this.selectedOptions[optionName] = optionValue;
        this.updateVariant();
      }
    });

    // Quantity
    this.querySelector('[data-action="decrease-qty"]')?.addEventListener('click', () => {
      const input = this.querySelector('.cc-quantity-input');
      if (input) input.value = Math.max(1, parseInt(input.value || 1) - 1);
    });

    this.querySelector('[data-action="increase-qty"]')?.addEventListener('click', () => {
      const input = this.querySelector('.cc-quantity-input');
      if (input) input.value = parseInt(input.value || 1) + 1;
    });

    // T&C checkbox
    const tncCb = this.querySelector('.cc-tnc-checkbox');
    const digitalBtn = this.querySelector('.cc-digital-checkout-btn');
    if (tncCb && digitalBtn) {
      tncCb.addEventListener('change', () => {
        digitalBtn.disabled = !tncCb.checked;
      });
    }

    // Physical add-to-cart
    const atcBtn = this.querySelector('.cc-add-to-cart-btn:not(.cc-digital-checkout-btn)');
    atcBtn?.addEventListener('click', async () => {
      await this.addPhysicalToCart();
    });

    // Digital checkout
    digitalBtn?.addEventListener('click', async () => {
      await this.addDigitalAndCheckout();
    });
  }

  /* --- Cart Actions --- */

  async addPhysicalToCart() {
    if (!this.selectedVariant?.available) return;

    const btn = this.querySelector('.cc-add-to-cart-btn:not(.cc-digital-checkout-btn)');
    const qty = parseInt(this.querySelector('.cc-quantity-input')?.value || 1);
    const originalText = btn?.textContent;

    this._setBtn(btn, true, 'Adding…');

    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.selectedVariant.id,
          quantity: qty,
          properties: { 'Product Format': 'Finished Product' },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.description || 'Error adding to cart');
      }

      // Notify theme cart components
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));

      // Try to open the theme's cart drawer, else go to cart page
      const drawer = document.querySelector('cart-drawer');
      if (drawer && typeof drawer.open === 'function') {
        drawer.open();
      } else {
        // Refresh cart count
        document.dispatchEvent(new CustomEvent('cart:item-added', { bubbles: true }));
      }

      this._setBtn(btn, false, '✓ Added');
      setTimeout(() => this._setBtn(btn, false, originalText), 2200);
    } catch (err) {
      console.error('[CC] Add to cart failed:', err);
      this._setBtn(btn, false, originalText);
      alert(err.message || 'Could not add to cart. Please try again.');
    }
  }

  async addDigitalAndCheckout() {
    const btn = this.querySelector('.cc-digital-checkout-btn');
    const variantId = this.productData?.variants?.[0]?.id;
    if (!variantId) return;

    this._setBtn(btn, true, 'Processing…');

    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: variantId,
          quantity: 1,
          properties: {
            'Product Format': '3D Printable File',
            '_digital': 'true',
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.description || 'Error');
      }

      // Go directly to checkout
      window.location.href = '/checkout';
    } catch (err) {
      console.error('[CC] Digital checkout failed:', err);
      this._setBtn(btn, false, 'Proceed to Checkout');
      alert(err.message || 'Could not proceed to checkout. Please try again.');
    }
  }

  _setBtn(btn, disabled, text) {
    if (!btn) return;
    btn.disabled = disabled;
    if (text) btn.textContent = text;
  }
}

customElements.define('cc-checkout-flow', CCCheckoutFlow);


/* ---- CC Product Media Gallery ---- */

class CCProductMedia extends HTMLElement {
  connectedCallback() {
    this.mainImg = this.querySelector('.cc-product-media__main');
    this.thumbs = this.querySelectorAll('.cc-product-media__thumb');

    // Set first thumb active
    this.thumbs[0]?.classList.add('active');

    this.thumbs.forEach(thumb => {
      thumb.addEventListener('click', () => {
        const fullSrc = thumb.dataset.full;
        if (this.mainImg && fullSrc) {
          this.mainImg.style.opacity = '0';
          setTimeout(() => {
            this.mainImg.src = fullSrc;
            this.mainImg.srcset = '';
            this.mainImg.style.opacity = '1';
          }, 150);
        }
        this.thumbs.forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }
}

customElements.define('cc-product-media', CCProductMedia);


/* ---- CC Accordion ---- */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.cc-accordion__trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const accordion = trigger.closest('.cc-accordion');
      const isOpen = accordion.hasAttribute('open');

      // Close all siblings
      const allAccordions = accordion.closest('.cc-accordions')?.querySelectorAll('.cc-accordion');
      allAccordions?.forEach(a => {
        a.removeAttribute('open');
        a.querySelector('.cc-accordion__trigger')?.setAttribute('aria-expanded', 'false');
      });

      // Open this one (toggle)
      if (!isOpen) {
        accordion.setAttribute('open', '');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
});
