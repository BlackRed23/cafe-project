-- Parent policy guard also protects receipt writers outside Ingredient HTTP service.
CREATE FUNCTION enforce_ingredient_lot_expiry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE classification TEXT;
DECLARE classification_required BOOLEAN;
BEGIN
  SELECT "expiryClassification", "expiryClassificationRequired" INTO classification, classification_required
    FROM "Ingredient" WHERE id = NEW."ingredientId" FOR SHARE;
  IF classification = 'PERISHABLE' AND NEW."expirationDate" IS NULL THEN
    RAISE EXCEPTION 'PERISHABLE ingredient requires expirationDate' USING ERRCODE = '23514';
  END IF;
  IF classification IS NULL AND classification_required THEN
    RAISE EXCEPTION 'Classify new ingredient expiry policy before receipt' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- @statement
CREATE TRIGGER "IngredientBatch_expiry_policy" BEFORE INSERT OR UPDATE OF "ingredientId", "expirationDate"
ON "IngredientBatch" FOR EACH ROW EXECUTE FUNCTION enforce_ingredient_lot_expiry();
