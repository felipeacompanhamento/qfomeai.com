const fs = require('fs');
let content = fs.readFileSync('src/pages/restaurant/Counter.tsx', 'utf8');

const effectCode = `
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        let currentRestId = restaurantProfile?.id || profile?.restaurantId;
        if (!currentRestId && user?.uid) {
          const fetchedRest = await restaurantService.getRestaurantByOwnerId(user.uid);
          if (fetchedRest) {
            currentRestId = fetchedRest.id;
            if (!restaurantProfile && isMounted) {
              setActiveRestaurantProfile(fetchedRest);
            }
          }
        }
        
        if (currentRestId && isMounted) {
          setRestaurantId(currentRestId);
          const [cats, prods, options] = await Promise.all([
            productService.getCategoriesByRestaurant(currentRestId),
            productService.getProducts(currentRestId),
            optionService.getAllOptions(currentRestId)
          ]);
          
          if (isMounted) {
            setCategories(cats || []);
            setProducts((prods || []).filter(p => p.ativo && isProductAvailableForChannel(p, 'counter')));
            setAllOptionItems(options || []);
          }
        }
      } catch (err) {
        console.error("Error loading counter data:", err);
        if (isMounted) setError("Erro ao carregar os dados. Tente novamente.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadData();
    
    return () => { isMounted = false; };
  }, [user?.uid, profile?.restaurantId, restaurantProfile]);
`;

content = content.replace(
  "  const [showSuccessModal, setShowSuccessModal] = useState(false);",
  "  const [showSuccessModal, setShowSuccessModal] = useState(false);\n" + effectCode
);

fs.writeFileSync('src/pages/restaurant/Counter.tsx', content);
