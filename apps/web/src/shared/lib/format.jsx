
export const formatMoney = (n) => (n < 0 ? '−' : '') + formatPrice(Math.abs(Math.round(n)));


export const formatPrice = (price) => price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
