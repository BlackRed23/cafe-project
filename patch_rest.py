import os

controller_file = "apps/api/src/modules/inventory/inventory.controller.ts"
with open(controller_file, "r", encoding="utf-8") as f:
    controller_content = f.read()

controller_content = controller_content.replace(
    """    const suggestion = await getInventoryThresholdSuggestion(req.params.id, {
        salesWindowDays: req.query.salesWindowDays ? Number(req.query.salesWindowDays) : undefined,
        bufferDays: req.query.bufferDays ? Number(req.query.bufferDays) : undefined,
        delayBufferDays: req.query.delayBufferDays ? Number(req.query.delayBufferDays) : undefined
    });""",
    """    const suggestion = await getInventoryThresholdSuggestion(req.params.id, {
        salesWindowDays: req.query.salesWindowDays ? Number(req.query.salesWindowDays) : undefined,
        bufferDays: req.query.bufferDays ? Number(req.query.bufferDays) : undefined,
        delayBufferDays: req.query.delayBufferDays ? Number(req.query.delayBufferDays) : undefined,
        planningPeriod: req.query.planningPeriod as any,
        planningDays: req.query.planningDays ? Number(req.query.planningDays) : undefined
    });"""
)

with open(controller_file, "w", encoding="utf-8") as f:
    f.write(controller_content)

api_file = "apps/web/src/api/inventory.api.ts"
with open(api_file, "r", encoding="utf-8") as f:
    api_content = f.read()

api_content = api_content.replace(
    """type ThresholdSuggestionParams = {
  salesWindowDays?: number;
  bufferDays?: number;
  delayBufferDays?: number;
};""",
    """type ThresholdSuggestionParams = {
  salesWindowDays?: number;
  bufferDays?: number;
  delayBufferDays?: number;
  planningPeriod?: 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  planningDays?: number;
};"""
)

with open(api_file, "w", encoding="utf-8") as f:
    f.write(api_content)
