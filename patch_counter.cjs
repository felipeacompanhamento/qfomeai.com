const fs = require('fs');

let content = fs.readFileSync('src/pages/restaurant/Counter.tsx', 'utf8');

// Imports
content = content.replace(
  "import { v4 as uuidv4 } from 'uuid';",
  "import { v4 as uuidv4 } from 'uuid';\nimport { PaymentsComposer } from './components/PaymentsComposer';\nimport { PaymentItem } from './components/PaymentsManager';"
);

// State
content = content.replace(
  "const [paymentMethod, setPaymentMethod] = useState<string>('');",
  `const [paymentMethod, setPaymentMethod] = useState<string>('');\n  const [payments, setPayments] = useState<PaymentItem[]>([]);`
);

// handleCreateOrder logic
content = content.replace(
  "if (!paymentMethod || !availablePaymentMethods.some(m => m.id === paymentMethod)) {",
  `const totalPaymentsCents = payments.reduce((acc, p) => acc + p.amount, 0);\n      if (totalPaymentsCents !== cartTotalCents) {\n        setError('A soma dos pagamentos deve ser igual ao total do pedido.');\n        return;\n      }`
);

content = content.replace(
  "if (paymentMethod === 'dinheiro' && isPaid) {",
  `if (payments.some(p => p.paymentMethodId === 'dinheiro') && isPaid) {`
);

// Replace orderData payment logic
const orderDataPaymentRegex = /paymentMethod,[\s\S]*?amountReceived:[^\n]*,/m;
content = content.replace(orderDataPaymentRegex, `forma_pagamento: payments.length > 0 ? payments.reduce((prev, current) => (prev.amount > current.amount) ? prev : current).paymentMethodId : 'dinheiro',\n        payments: payments.map(p => ({ ...p, status: isPaid ? 'PAID' : 'PENDING' })),\n        amountReceived: payments.some(p => p.paymentMethodId === 'dinheiro') && isPaid ? amountPaidParsed.numberValue : 0,`);

// JSX replacement
const paymentSelectorRegex = /\{\/\* Payment Method Selector \*\/\}[\s\S]*?\{\/\* Cash Change Input \*\/}/;
content = content.replace(paymentSelectorRegex, `
            <PaymentsComposer 
              totalOrderCents={cartTotalCents}
              payments={payments}
              setPayments={setPayments}
              configuredMethods={activeRestaurantProfile?.formas_pagamento || activeRestaurantProfile?.payment_methods}
              isPaid={isPaid}
              setIsPaid={setIsPaid}
            />
            {/* Cash Change Input */}`);

// Update error disabled check
content = content.replace(
  "disabled={cart.length === 0 || saveLoading || isCashAmountInsufficient || availablePaymentMethods.length === 0 || !paymentMethod}",
  "disabled={cart.length === 0 || saveLoading || isCashAmountInsufficient || availablePaymentMethods.length === 0 || payments.reduce((a,b)=>a+b.amount,0)!==cartTotalCents}"
);

fs.writeFileSync('src/pages/restaurant/Counter.tsx', content);
