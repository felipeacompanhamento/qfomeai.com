const fs = require('fs');

function replaceFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  content = content.replace(/o\.items \|\| o\.itens\?\./g, 'o.itens?.'); // rollback previous bad sed
  content = content.replace(/o\.itens\?\./g, '(o.items || o.itens)?.');
  content = content.replace(/order\.itens\?\./g, '(order.items || order.itens)?.');
  content = content.replace(/selectedOrder\.itens\?\./g, '(selectedOrder.items || selectedOrder.itens)?.');
  content = content.replace(/selectedOrder\.itens\./g, '(selectedOrder.items || selectedOrder.itens)?.');
  content = content.replace(/orderData\.itens\?\./g, '(orderData.items || orderData.itens)?.');

  fs.writeFileSync(filePath, content);
}

replaceFile('src/pages/restaurant/Dashboard.tsx');
replaceFile('src/pages/restaurant/components/OrderListItem.tsx');
replaceFile('src/pages/restaurant/components/OrderDetails.tsx');
replaceFile('src/pages/restaurant/OrdersManager.tsx');
replaceFile('src/pages/client/Orders.tsx');
replaceFile('src/pages/admin/Dashboard.tsx');
replaceFile('server.ts');
