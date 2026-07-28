const fs = require('fs');

let content = fs.readFileSync('src/pages/restaurant/Counter.tsx', 'utf8');

const imports = `import { v4 as uuidv4 } from 'uuid';
import { PaymentsComposer } from './components/PaymentsComposer';
import { PaymentItem } from './components/PaymentsManager';
`;
content = content.replace("import { printThermalOrder }", imports + "import { printThermalOrder }");

const computed = `  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nome.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'todos' || p.categoriaId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const availablePaymentMethods = activeRestaurantProfile?.formas_pagamento || activeRestaurantProfile?.payment_methods || [];
  
  const isCustomizationValid = customizingProduct && (!customizingProduct.tamanhos?.length || selectedSize);
`;
content = content.replace("const isCashAmountInsufficient", computed + "\n  const isCashAmountInsufficient");

// Also remove `paymentMethod: paymentMethod,` from `createCounterOrder`
content = content.replace("paymentMethod: paymentMethod,", "");

fs.writeFileSync('src/pages/restaurant/Counter.tsx', content);
