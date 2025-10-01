/**
 * Comprehensive menu database for Gino's Pizza
 * Structured, filterable menu items with pricing, calories, and dietary flags
 */

export const MENU = [
  // =====================
  // PIZZA SIZES
  // =====================
  { id: 'size-s', kind: 'size', name: 'Small', inches: 10, slices: 6, calories_per_slice: 160, base_price: 8, topping_price: 1.25 },
  { id: 'size-m', kind: 'size', name: 'Medium', inches: 12, slices: 8, calories_per_slice: 180, base_price: 10, topping_price: 1.75 },
  { id: 'size-l', kind: 'size', name: 'Large', inches: 14, slices: 10, calories_per_slice: 190, base_price: 12, topping_price: 2.00 },
  { id: 'size-xl', kind: 'size', name: 'X-Large', inches: 16, slices: 12, calories_per_slice: 200, base_price: 14, topping_price: 2.75 },
  { id: 'size-pr', kind: 'size', name: 'Party Round', inches: 20, slices: 16, calories_per_slice: 230, base_price: 24, topping_price: 4.00 },
  { id: 'size-pt', kind: 'size', name: 'Party Tray', inches: '21×15', slices: 20, calories_per_slice: 190, base_price: 24, topping_price: 4.00 },
  { id: 'size-ps', kind: 'size', name: 'Party Square', inches: '20×20', slices: 25, calories_per_slice: 190, base_price: 28, topping_price: 5.00 },

  // =====================
  // CRUSTS
  // =====================
  { id: 'crust-original', kind: 'crust', name: 'Original', calories_range: '440-3320' },
  { id: 'crust-whole-wheat', kind: 'crust', name: 'Whole Wheat', calories_range: '450-3400' },
  { id: 'crust-thin', kind: 'crust', name: 'Thin', calories_range: '330-2660' },
  { id: 'crust-thick', kind: 'crust', name: 'Thick', calories_range: '670-3990' },
  { id: 'crust-pan', kind: 'crust', name: 'Pan Crust', extra: true, calories: 1120 },
  { id: 'crust-cauliflower', kind: 'crust', name: 'Cauliflower', extra: true, gluten_free: true, calories: 660 },

  // =====================
  // SAUCE BASES
  // =====================
  { id: 'sauce-traditional', kind: 'sauce', name: 'Traditional', calories_per_oz: 20 },
  { id: 'sauce-bbq', kind: 'sauce', name: 'BBQ', calories_per_oz: 40 },
  { id: 'sauce-garlic', kind: 'sauce', name: 'Garlic Spread', calories_per_oz: 140 },
  { id: 'sauce-pesto', kind: 'sauce', name: 'Pesto', extra: true },
  { id: 'sauce-alfredo', kind: 'sauce', name: 'Alfredo', extra: true },
  { id: 'sauce-shawarma', kind: 'sauce', name: 'Shawarma', extra: true },
  { id: 'sauce-butter-chicken', kind: 'sauce', name: 'Butter Chicken', extra: true },
  { id: 'sauce-tandoori', kind: 'sauce', name: 'Signature Tandoori', extra: true },

  // =====================
  // CHEESE TOPPINGS
  // =====================
  { id: 'top-extra-cheese', kind: 'topping', name: 'Extra Cheese', category: 'cheese', vegetarian: true, counts_as: 2 },
  { id: 'top-cheddar', kind: 'topping', name: 'Cheddar', category: 'cheese', vegetarian: true },
  { id: 'top-feta', kind: 'topping', name: 'Feta', category: 'cheese', vegetarian: true },
  { id: 'top-double-cheese', kind: 'topping', name: 'Double Cheese', category: 'cheese', vegetarian: true, counts_as: 2 },

  // =====================
  // VEGETABLE TOPPINGS
  // =====================
  { id: 'top-mushrooms', kind: 'topping', name: 'Mushrooms', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-pineapple', kind: 'topping', name: 'Pineapple', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-green-peppers', kind: 'topping', name: 'Green Peppers', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-tomatoes', kind: 'topping', name: 'Tomatoes', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-red-peppers', kind: 'topping', name: 'Red Peppers', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-olives-green', kind: 'topping', name: 'Green Olives', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-olives-black', kind: 'topping', name: 'Black Olives', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-hot-peppers', kind: 'topping', name: 'Hot Peppers', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-red-onions', kind: 'topping', name: 'Red Onions', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-sun-dried-tomatoes', kind: 'topping', name: 'Sun-Dried Tomatoes', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-jalapenos', kind: 'topping', name: 'Jalapeños', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-broccoli', kind: 'topping', name: 'Broccoli', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-spinach', kind: 'topping', name: 'Spinach', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-corn', kind: 'topping', name: 'Corn', category: 'veg', vegetarian: true, vegan: true },
  { id: 'top-bruschetta-mix', kind: 'topping', name: 'Bruschetta Mix', category: 'veg', vegetarian: true, vegan: true, counts_as: 4 },
  { id: 'top-paneer-shahi', kind: 'topping', name: 'Shahi Paneer', category: 'veg', vegetarian: true, counts_as: 2 },
  { id: 'top-paneer-tandoori', kind: 'topping', name: 'Tandoori Paneer', category: 'veg', vegetarian: true, counts_as: 2 },
  { id: 'top-paneer-peri-peri', kind: 'topping', name: 'Peri Peri Paneer', category: 'veg', vegetarian: true, counts_as: 2 },

  // =====================
  // MEAT TOPPINGS
  // =====================
  { id: 'top-grilled-chicken', kind: 'topping', name: 'Grilled Chicken', category: 'meat', counts_as: 2 },
  { id: 'top-pepperoni', kind: 'topping', name: 'Pepperoni', category: 'meat' },
  { id: 'top-bacon-strips', kind: 'topping', name: 'Bacon Strips', category: 'meat' },
  { id: 'top-bacon-crumble', kind: 'topping', name: 'Bacon Crumble', category: 'meat' },
  { id: 'top-ham', kind: 'topping', name: 'Ham', category: 'meat' },
  { id: 'top-sausage-hot', kind: 'topping', name: 'Hot Sausage', category: 'meat' },
  { id: 'top-sausage-mild', kind: 'topping', name: 'Mild Sausage', category: 'meat' },
  { id: 'top-sausage-beef', kind: 'topping', name: 'Beef Sausage', category: 'meat' },
  { id: 'top-sausage-soya', kind: 'topping', name: 'Soya Sausage', category: 'meat', vegetarian: true, vegan: true },
  { id: 'top-salami', kind: 'topping', name: 'Salami', category: 'meat' },
  { id: 'top-anchovies', kind: 'topping', name: 'Anchovies', category: 'meat' },
  { id: 'top-bbq-chicken', kind: 'topping', name: 'BBQ Chicken', category: 'meat', counts_as: 2 },
  { id: 'top-chicken-shawarma', kind: 'topping', name: 'Chicken Shawarma', category: 'meat', counts_as: 2 },
  { id: 'top-tandoori-chicken', kind: 'topping', name: 'Tandoori Chicken', category: 'meat', counts_as: 2 },
  { id: 'top-peri-peri-chicken', kind: 'topping', name: 'Peri Peri Chicken', category: 'meat', counts_as: 2 },

  // =====================
  // GOURMET PIZZAS
  // =====================
  { id: 'gourmet-bacon-cheeseburger', kind: 'gourmet', name: 'Bacon Cheeseburger', details: 'Ground Beef, Bacon Crumble, and Cheddar Cheese', pricing: { small: 11.75, medium: 15.25, large: 18.00, xlarge: 22.25, party_round: 36.00, party_square: 43.00 } },
  { id: 'gourmet-canadian', kind: 'gourmet', name: 'Canadian', details: 'Pepperoni, Mushroom, and Bacon Crumble', pricing: { small: 11.75, medium: 15.25, large: 18.00, xlarge: 22.25, party_round: 36.00, party_square: 43.00 } },
  { id: 'gourmet-grilled-chicken-club', kind: 'gourmet', name: 'Grilled Chicken Club', details: 'Chicken, Tomatoes, and Red Onions', pricing: { small: 13.00, medium: 17.00, large: 20.00, xlarge: 25.00, party_round: 40.00, party_square: 48.00 } },
  { id: 'gourmet-hawaiian', kind: 'gourmet', name: 'Hawaiian', details: 'Pineapple, Ham, and Bacon Crumble', pricing: { small: 11.75, medium: 15.25, large: 18.00, xlarge: 22.25, party_round: 36.00, party_square: 43.00 } },
  { id: 'gourmet-meat-lovers', kind: 'gourmet', name: 'Meat Lovers', details: 'Pepperoni, Bacon Crumble, and Ham', pricing: { small: 11.75, medium: 15.25, large: 18.00, xlarge: 22.25, party_round: 36.00, party_square: 43.00 } },
  { id: 'gourmet-meat-mania', kind: 'gourmet', name: 'Meat Mania', details: 'Pepperoni, Bacon Crumble, and Mild Sausage', pricing: { small: 11.75, medium: 15.25, large: 18.00, xlarge: 22.25, party_round: 36.00, party_square: 43.00 } },
  { id: 'gourmet-royal', kind: 'gourmet', name: 'Royal', details: 'Pepperoni, Mushroom, and Green Peppers', pricing: { small: 11.75, medium: 15.25, large: 18.00, xlarge: 22.25, party_round: 36.00, party_square: 43.00 } },
  { id: 'gourmet-bacon-bonanza', kind: 'gourmet', name: 'Bacon Bonanza', details: 'Bacon Crumble, Bacon Strips, Ham, & Extra Cheese', pricing: { small: 14.25, medium: 18.75, large: 22.00, xlarge: 27.75, party_round: 44.00, party_square: 53.00 } },
  { id: 'gourmet-vegetarian', kind: 'gourmet', name: 'Vegetarian', details: 'Mushroom, Green Peppers, and Tomatoes', pricing: { small: 11.75, medium: 15.25, large: 18.00, xlarge: 22.25, party_round: 36.00, party_square: 43.00 } },
  { id: 'gourmet-bbq-chicken-corn', kind: 'gourmet', name: 'BBQ Chicken Corn', details: 'BBQ Chicken, Corn, Red Onions & Tomato Sauce Base', pricing: { large: 18.00 } },
  { id: 'gourmet-chicken-shawarma', kind: 'gourmet', name: 'Chicken Shawarma Pizza', details: 'Marinated Chicken Shawarma, Shawarma Sauce as Base, Tomatoes, Red Onions & Shawarma Sauce Drizzle on Top', pricing: { small: 16.00, medium: 18.00, large: 20.00, xlarge: 25.00 } },
  { id: 'gourmet-chicken-bacon-alfredo', kind: 'gourmet', name: 'Chicken Bacon Alfredo Pizza', details: 'Alfredo Sauce as Base, Bacon Crumbles, Chicken, Mushrooms & Cheddar Cheese', pricing: { small: 16.00, medium: 18.00, large: 20.00 } },
  { id: 'gourmet-bruschetta', kind: 'gourmet', name: 'Bruschetta', details: 'Bruschetta Mix, Oregano, and Garlic Spread instead of Pizza Sauce', pricing: { small: 13.00, medium: 17.00, large: 20.00, xlarge: 25.00, party_round: 40.00, party_square: 48.00 }, vegetarian: true },
  { id: 'gourmet-greek', kind: 'gourmet', name: 'Greek', details: 'Feta Cheese, Black Olives, Red Onions, and Tomatoes', pricing: { small: 13.00, medium: 17.00, large: 20.00, xlarge: 25.00, party_round: 40.00, party_square: 48.00 }, vegetarian: true },
  { id: 'gourmet-mega-veggie', kind: 'gourmet', name: 'Mega Veggie', details: 'Mushroom, Green Peppers, Tomatoes, and Red Onions', pricing: { small: 13.00, medium: 17.00, large: 20.00, xlarge: 25.00, party_round: 40.00, party_square: 48.00 }, vegetarian: true },
  { id: 'gourmet-spinach-supreme', kind: 'gourmet', name: 'Spinach Supreme', details: 'Spinach, Feta Cheese, Cheddar Cheese, Red Peppers, and Garlic Spread instead of Pizza Sauce', pricing: { small: 13.00, medium: 17.00, large: 20.00, xlarge: 25.00, party_round: 40.00, party_square: 48.00 }, vegetarian: true },
  { id: 'gourmet-shahi-paneer', kind: 'gourmet', name: 'Shahi Paneer Pizza', details: 'Mozzarella Cheese, Signature Shahi Sauce, Shahi Paneer, Green Peppers & Onions', pricing: { large: 20.00 }, vegetarian: true },
  { id: 'gourmet-tandoori-paneer', kind: 'gourmet', name: 'Tandoori Paneer Pizza', details: 'Tandoori Paneer, Green Peppers, Onions & Our Signature Tandoori Sauce', pricing: { large: 20.00 }, vegetarian: true },
  { id: 'gourmet-butter-chicken', kind: 'gourmet', name: 'Butter Chicken Pizza', details: 'Chicken, Red Onions, Green Peppers, and Butter Chicken Sauce', pricing: { small: 16.00, medium: 18.00, large: 20.00, xlarge: 25.00 } },
  { id: 'gourmet-tandoori-chicken', kind: 'gourmet', name: 'Tandoori Chicken Pizza', details: 'Tandoori Chicken, Green Peppers, Onions & Our Signature Tandoori Base', pricing: { large: 20.00 } },
  
  // Gourmet pizzas without detailed pricing (keeping existing structure)
  { id: 'gourmet-peri-peri-chicken', kind: 'gourmet', name: 'Peri Peri Chicken', details: 'Peri Peri Sauce, Chicken, Green Peppers, Red Onions' },
  { id: 'gourmet-cheese', kind: 'gourmet', name: 'Cheese', details: 'Mozzarella & Cheddar', vegetarian: true },
  { id: 'gourmet-pepperoni', kind: 'gourmet', name: 'Pepperoni', details: 'Sauce, Mozzarella, Pepperoni' },
  { id: 'gourmet-peri-peri-paneer', kind: 'gourmet', name: 'Peri Peri Paneer', details: 'Paneer, Green Peppers, Red Onions, Peri Peri Sauce', vegetarian: true },

  // =====================
  // DEALS & SPECIALS
  // =====================
  { id: 'deal-single-pizza', kind: 'deal', name: 'Single Pizza Special', price_from: 9, details: 'Pizza + 1 Topping + Free Dip' },
  { id: 'deal-single', kind: 'deal', name: 'Single Deal', price_from: 15, details: 'Pizza + 3 Toppings + 2 Drinks (591ml) + 2 Free Dips' },
  { id: 'deal-ginos-original', kind: 'deal', name: 'Gino\'s Original', price_from: 23, details: '2 Pizzas w/ 3 Toppings + 2 Free Dips' },
  { id: 'deal-pizza-wings', kind: 'deal', name: 'Pizza & Wings', price_from: 23, details: 'Pizza + 3 Toppings + 8 Wings + Dip' },
  { id: 'deal-panzerotti-combo', kind: 'deal', name: 'Panzerotti Combo', price_from: 26, details: '2 Panzerottis w/ 3 Toppings + 2 Drinks + 2 Free Dips' },
  { id: 'deal-triple', kind: 'deal', name: 'Triple Deal', price_from: 39, details: '3 Pizzas w/ 3 Toppings + 2L Pepsi + 3 Dips' },
  { id: 'deal-two-can-dine', kind: 'deal', name: 'Two Can Dine', price_from: 16, details: '2 Small Pizzas w/ 2 Toppings + 2 Dips' },
  { id: 'deal-pizza-tray', kind: 'deal', name: 'The Pizza Tray', price_from: 26, details: '20 Slice Party Tray Pizza + 1 Topping + 2 Free Dips' },
  { id: 'deal-large-pan-pizza', kind: 'deal', name: 'Large Pan Pizza Special', price_from: 17, details: 'Large Pan Pizza w/ 3 Toppings + Dip' },

  // =====================
  // WINGS & ADD-ONS
  // =====================
  { id: 'addon-wings-baked-8', kind: 'addon', name: 'Baked Wings (8 pcs)', price: 10, calories_per_piece: 80 },
  { id: 'addon-wings-baked-12', kind: 'addon', name: 'Baked Wings (12 pcs)', price: 15, calories_per_piece: 80 },
  { id: 'addon-wings-breaded-8', kind: 'addon', name: 'Breaded Wings (8 pcs)', price: 12, calories_per_piece: 80 },
  { id: 'addon-wings-breaded-12', kind: 'addon', name: 'Breaded Wings (12 pcs)', price: 18, calories_per_piece: 80 },
  { id: 'addon-wings-boneless-8', kind: 'addon', name: 'Boneless Wings (8 pcs)', price: 10, calories_per_piece: 60 },
  { id: 'addon-wings-boneless-12', kind: 'addon', name: 'Boneless Wings (12 pcs)', price: 15, calories_per_piece: 60 },

  // Wing Sauces
  { id: 'sauce-wings-bbq', kind: 'sauce', name: 'BBQ Wing Sauce', price: 1 },
  { id: 'sauce-wings-mild', kind: 'sauce', name: 'Mild Wing Sauce', price: 1 },
  { id: 'sauce-wings-medium', kind: 'sauce', name: 'Medium Wing Sauce', price: 1 },
  { id: 'sauce-wings-hot', kind: 'sauce', name: 'Hot Wing Sauce', price: 1 },
  { id: 'sauce-wings-thai', kind: 'sauce', name: 'Thai Wing Sauce', price: 1 },
  { id: 'sauce-wings-peri-peri', kind: 'sauce', name: 'Peri Peri Wing Sauce', price: 1 },
  { id: 'sauce-wings-honey-garlic', kind: 'sauce', name: 'Honey Garlic Wing Sauce', price: 1 },
  { id: 'sauce-wings-buffalo', kind: 'sauce', name: 'Buffalo Wing Sauce', price: 1 },
  { id: 'sauce-wings-butter-chicken', kind: 'sauce', name: 'Butter Chicken Wing Sauce', price: 1 },

  // =====================
  // SALADS
  // =====================
  { id: 'salad-caesar', kind: 'salad', name: 'Caesar Salad', price: 7, calories: 450 },
  { id: 'salad-greek', kind: 'salad', name: 'Greek Salad', price: 7, calories: 250 },
  { id: 'salad-garden', kind: 'salad', name: 'Garden Salad', price: 7, calories: 260 },

  // =====================
  // FRESH BREADS
  // =====================
  { id: 'addon-garlic-bread', kind: 'addon', name: 'Garlic Bread', price: 5, calories_per_piece: 180, vegetarian: true },
  { id: 'addon-garlic-bread-cheese', kind: 'addon', name: 'Garlic Bread + Cheese', price: 7, calories_per_piece: 220, vegetarian: true },
  { id: 'addon-cheesy-bread', kind: 'addon', name: 'Cheesy Bread (with dip)', price: 8, calories_per_piece: 70, vegetarian: true },
  { id: 'addon-garlic-bread-sticks', kind: 'addon', name: 'Garlic Bread Sticks (6 pcs)', price: 5, calories_per_piece: 80, vegetarian: true },
  { id: 'addon-bruschetta-bread', kind: 'addon', name: 'Bruschetta Bread', price: 7, calories_per_piece: 150, vegetarian: true },
  { id: 'addon-flavoured-bites-garlic', kind: 'addon', name: 'Garlic Flavoured Bites', price: 5, vegetarian: true },
  { id: 'addon-flavoured-bites-cinnamon', kind: 'addon', name: 'Cinnamon & Sugar Flavoured Bites', price: 5, vegetarian: true },
  { id: 'addon-flavoured-bites-parmesan', kind: 'addon', name: 'Parmesan & Oregano Flavoured Bites', price: 5, vegetarian: true },

  // =====================
  // BAKED WEDGES
  // =====================
  { id: 'addon-wedges-regular', kind: 'addon', name: 'Baked Wedges (8oz)', price: 4, calories: 700 },
  { id: 'addon-wedges-large', kind: 'addon', name: 'Baked Wedges (16oz)', price: 8, calories: 1400 },

  // =====================
  // BEVERAGES
  // =====================
  // 591ml Individual Bottles
  { id: 'addon-pepsi-591ml', kind: 'addon', name: 'Pepsi (591ml)', price: 2, calories_range: '0-290' },
  { id: 'addon-diet-pepsi-591ml', kind: 'addon', name: 'Diet Pepsi (591ml)', price: 2, calories: 0 },
  { id: 'addon-7up-591ml', kind: 'addon', name: '7UP (591ml)', price: 2, calories_range: '0-290' },
  { id: 'addon-mountain-dew-591ml', kind: 'addon', name: 'Mountain Dew (591ml)', price: 2, calories_range: '0-290' },
  { id: 'addon-dr-pepper-591ml', kind: 'addon', name: 'Dr Pepper (591ml)', price: 2, calories_range: '0-290' },
  { id: 'addon-root-beer-591ml', kind: 'addon', name: 'Root Beer (591ml)', price: 2, calories_range: '0-290' },
  { id: 'addon-ice-tea-591ml', kind: 'addon', name: 'Ice Tea (591ml)', price: 2, calories_range: '0-290' },
  { id: 'addon-ginger-ale-591ml', kind: 'addon', name: 'Ginger Ale (591ml)', price: 2, calories_range: '0-290' },
  { id: 'addon-orange-crush-591ml', kind: 'addon', name: 'Orange Crush (591ml)', price: 2, calories_range: '0-290' },
  
  // Water
  { id: 'addon-aquafina-500ml', kind: 'addon', name: 'Aquafina (500ml)', price: 2, calories: 0 },
  
  // Juices
  { id: 'addon-orange-juice', kind: 'addon', name: 'Orange Juice (Dole Orange Juice)', price: 2, calories: 120 },
  { id: 'addon-apple-juice', kind: 'addon', name: 'Apple Juice (Dole Apple Juice)', price: 2, calories: 120 },
  
  // Sparkling Water & Energy Drinks
  { id: 'addon-brio-355ml', kind: 'addon', name: 'BRIO (355ml)', price: 2, calories: 140 },
  { id: 'addon-bubly-cherry-473ml', kind: 'addon', name: 'Bubly - Cherry (473ml Can)', price: 2, calories: 0 },
  { id: 'addon-bubly-grapefruit-473ml', kind: 'addon', name: 'Bubly - Grapefruit (473ml Can)', price: 2, calories: 0 },
  { id: 'addon-bubly-lime-473ml', kind: 'addon', name: 'Bubly - Lime (473ml Can)', price: 2, calories: 0 },
  { id: 'addon-gatorade-fruit-punch-355ml', kind: 'addon', name: 'Gatorade Fruit Punch (355ml Bottle)', price: 3, calories: 80 },
  { id: 'addon-gatorade-orange-355ml', kind: 'addon', name: 'Gatorade Orange (355ml Bottle)', price: 3, calories: 80 },
  
  // Multi-Packs
  { id: 'addon-3-pack-591ml', kind: 'addon', name: '3 Pack (Three 591ml Bottles of Pop)', price: 5, calories_range: '0-870' },
  { id: 'addon-4-pack-591ml', kind: 'addon', name: '4 Pack (Four 591ml Bottles of Pop)', price: 7, calories_range: '0-1160' },
  
  // 2 Litre Bottles
  { id: 'addon-pepsi-2l', kind: 'addon', name: 'Pepsi (2L)', price: 4, calories_range: '0-880' },
  { id: 'addon-diet-pepsi-2l', kind: 'addon', name: 'Diet Pepsi (2L)', price: 4, calories: 0 },
  { id: 'addon-7up-2l', kind: 'addon', name: '7UP (2L)', price: 4, calories_range: '0-880' },
  { id: 'addon-2l-pop', kind: 'addon', name: '2 Litre of Pop (Available in Pepsi, Diet Pepsi or 7-Up)', price: 4, calories_range: '0-880' },
  
  // Other
  { id: 'addon-pringles', kind: 'addon', name: 'Pringles', price: 2, calories: 200 },

  // =====================
  // DESSERTS
  // =====================
  { id: 'addon-chocolate-lava-cake', kind: 'addon', name: 'Chocolate Lava Cake (2 pcs)', price: 7, calories_per_piece: 380, vegetarian: true },
  { id: 'addon-cheesecake-strawberry', kind: 'addon', name: 'Strawberry Swirl Cheesecake', price: 6, calories: 250, vegetarian: true },
  { id: 'addon-cheesecake-cookies-cream', kind: 'addon', name: 'Cookies & Cream Cheesecake', price: 6, calories: 270, vegetarian: true },

  // =====================
  // DIPPING SAUCES
  // =====================
  { id: 'dip-garlic', kind: 'dip', name: 'Garlic Dip', price: 1, calories: 140 },
  { id: 'dip-ranch', kind: 'dip', name: 'Ranch Dip', price: 1, calories: 190 },
  { id: 'dip-cheddar', kind: 'dip', name: 'Cheddar Dip', price: 1, calories: 170 },
  { id: 'dip-marinara', kind: 'dip', name: 'Marinara Dip', price: 1, calories: 30 },
  { id: 'dip-honey-garlic', kind: 'dip', name: 'Honey Garlic Dip', price: 1, calories: 180 },
  { id: 'dip-5-pack', kind: 'dip', name: '5 Dipping Sauces', price: 4, calories_range: '150-950' },
];

/**
 * Filter menu items based on criteria
 * @param {Object} filters - Filter criteria
 * @param {string[]} filters.kinds - Item kinds to include ['size','crust','sauce','topping','gourmet','deal','addon','salad','dip']
 * @param {string} filters.dietary - Dietary restriction 'vegan' | 'vegetarian' | 'gluten_free'
 * @param {string} filters.search - Free text search
 * @param {number} filters.limit - Maximum results to return
 * @returns {Object[]} Filtered menu items
 */
export function findMenuItems(filters = {}) {
  const {
    kinds,              // ['size','crust','sauce','topping','gourmet','deal','addon','salad','dip']
    dietary,            // 'vegan' | 'vegetarian' | 'gluten_free'
    search,             // free text, e.g., 'pepperoni', 'deal'
    limit = 12
  } = filters;

  return MENU.filter(item => {
    // Filter by kinds
    if (kinds && kinds.length && !kinds.includes(item.kind)) return false;
    
    // Filter by dietary restrictions
    if (dietary === 'vegan' && item.vegan !== true) {
      // Allow non-food kinds through (sizes/crusts) when relevant
      if (item.kind === 'topping' || item.kind === 'deal' || item.kind === 'gourmet' || item.kind === 'addon' || item.kind === 'salad') return false;
    }
    if (dietary === 'vegetarian' && item.vegetarian !== true) {
      if (item.kind === 'topping' || item.kind === 'deal' || item.kind === 'gourmet' || item.kind === 'addon' || item.kind === 'salad') return false;
    }
    if (dietary === 'gluten_free' && item.gluten_free !== true) {
      if (item.kind === 'crust') return false;
    }
    
    // Filter by search text
    if (search) {
      const q = search.toLowerCase();
      const hay = [item.name, item.details, item.category].filter(Boolean).join(' ').toLowerCase();
      
      // Direct match
      if (hay.includes(q)) return true;
      
      // Handle common pizza variations
      if (item.kind === 'gourmet') {
        // Remove "pizza" from search term for gourmet items
        const pizzaLessQ = q.replace(/\bpizza\b/g, '').trim();
        if (pizzaLessQ && hay.includes(pizzaLessQ)) return true;
        
        // Handle specific common variations
        const variations = {
          'hawaiian pizza': 'hawaiian',
          'hawaiian': 'hawaiian',
          'meat lovers pizza': 'meat lovers',
          'meat lovers': 'meat lovers',
          'veggie pizza': 'mega veggie',
          'vegetarian pizza': 'mega veggie',
          'cheese pizza': 'cheese',
          'margherita pizza': 'margherita',
          'margherita': 'margherita',
          'pepperoni pizza': 'pepperoni',
          'pepperoni': 'pepperoni',
          'supreme pizza': 'supreme',
          'supreme': 'supreme',
          'bbq chicken pizza': 'bbq chicken',
          'bbq chicken': 'bbq chicken',
          'chicken pizza': 'chicken',
          'chicken': 'chicken'
        };
        
        if (variations[q] && hay.includes(variations[q])) return true;
      }
      
      return false;
    }
    
    return true;
  }).slice(0, limit);
}

/**
 * Get a specific menu item by ID
 * @param {string} id - Menu item ID
 * @returns {Object|null} Menu item or null if not found
 */
export function getMenuItem(id) {
  return MENU.find(item => item.id === id) || null;
}

/**
 * Get menu items by category
 * @param {string} category - Category name (e.g., 'meat', 'veg', 'cheese')
 * @returns {Object[]} Menu items in that category
 */
export function getMenuItemsByCategory(category) {
  return MENU.filter(item => item.category === category);
}
