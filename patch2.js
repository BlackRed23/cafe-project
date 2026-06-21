const fs = require('fs');
const file = 'apps/web/src/pages/admin/AdminInventoryPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add states
content = content.replace(
  'const [isSuggesting, setIsSuggesting] = useState(false);',
  `const [isSuggesting, setIsSuggesting] = useState(false);
  const [planningPeriod, setPlanningPeriod] = useState<"WEEKLY" | "MONTHLY" | "CUSTOM">("WEEKLY");
  const [planningDays, setPlanningDays] = useState<number>(14);`
);

// Update fetchSuggestion function and handleCloseModal
content = content.replace(
  'const handleCloseModal = () => {',
  `const fetchSuggestion = async (period: "WEEKLY" | "MONTHLY" | "CUSTOM", days: number) => {
    if (!selectedInventory) return;
    setIsSuggesting(true);
    try {
      const suggestion = await inventoryApi.getThresholdSuggestion((selectedInventory as any).inventoryId ?? selectedInventory.id, {
        planningPeriod: period,
        planningDays: days,
      });
      setThresholdSuggestion(suggestion);
    } catch (err) {
      console.error("Failed to load suggestion");
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleCloseModal = () => {`
);

// Update getThresholdSuggestion call inside handleOpenModal
content = content.replace(
  'const suggestion = await inventoryApi.getThresholdSuggestion((inv as any).inventoryId ?? inv.id);',
  'const suggestion = await inventoryApi.getThresholdSuggestion((inv as any).inventoryId ?? inv.id, { planningPeriod: "WEEKLY", planningDays: 14 });'
);

// Add reset of states inside handleOpenModal and handleCloseModal
content = content.replace(
  /setThresholdSuggestion\(null\);\s*try {/g,
  `setThresholdSuggestion(null);
      setPlanningPeriod("WEEKLY");
      setPlanningDays(14);
      try {`
);

fs.writeFileSync(file, content);
