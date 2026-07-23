import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export const seedInitialData = async () => {
  const catRef = collection(db, 'categories');
  const catSnap = await getDocs(catRef);
  
  if (catSnap.empty) {
    const categories = [
      { nome: 'Hambúrguer', icon_url: 'https://cdn-icons-png.flaticon.com/512/3075/3075977.png' },
      { nome: 'Pizza', icon_url: 'https://cdn-icons-png.flaticon.com/512/3595/3595455.png' },
      { nome: 'Japonesa', icon_url: 'https://cdn-icons-png.flaticon.com/512/2252/2252439.png' },
      { nome: 'Italiana', icon_url: 'https://cdn-icons-png.flaticon.com/512/2718/2718224.png' },
      { nome: 'Brasileira', icon_url: 'https://cdn-icons-png.flaticon.com/512/2965/2965567.png' },
      { nome: 'Doces', icon_url: 'https://cdn-icons-png.flaticon.com/512/2454/2454282.png' },
    ];

    for (const cat of categories) {
      await addDoc(catRef, cat);
    }
    console.log('Categories seeded!');
  }

  const bairroRef = collection(db, 'bairros');
  const bairroSnap = await getDocs(bairroRef);
  if (bairroSnap.empty) {
    const bairros = [
      { nome: 'Centro' },
      { nome: 'Jardim América' },
      { nome: 'Vila Nova' },
      { nome: 'Santa Cruz' },
    ];
    for (const b of bairros) {
      await addDoc(bairroRef, b);
    }
    console.log('Bairros seeded!');
  }
};
