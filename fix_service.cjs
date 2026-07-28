const fs = require('fs');
let content = fs.readFileSync('src/services/counterOrderService.ts', 'utf8');

content = content.replace("paymentMethod,", "forma_pagamento,\n      payments,");
content = content.replace("paymentMethod,\n        pago,", "forma_pagamento,\n        payments,\n        pago,");

fs.writeFileSync('src/services/counterOrderService.ts', content);
