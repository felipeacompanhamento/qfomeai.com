const fs = require('fs');
let content = fs.readFileSync('src/pages/restaurant/Counter.tsx', 'utf8');

const oldFn = `  const updateCartQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    const newCart = [...cart];
    newCart[index].quantidade = newQuantity;
    setCart(newCart);
  };`;
  
const newFn = `  const updateCartQuantity = (cartId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.cartId === cartId) {
        const newQty = item.quantidade + delta;
        if (newQty < 1) return item;
        return { ...item, quantidade: newQty };
      }
      return item;
    }));
  };`;

content = content.replace(oldFn, newFn);
fs.writeFileSync('src/pages/restaurant/Counter.tsx', content);
