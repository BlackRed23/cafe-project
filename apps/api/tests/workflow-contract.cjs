const assert = require('node:assert/strict');
const command = (key, versions = {}, actorId = 'admin') => ({ key, scope: 'local', actorId, versions });
const sale = { productId: 'coffee', servings: '1', omitted: [], effects: [], amount: '30.00' };
/** Reusable adapter contract: future PostgreSQL harness supplies reset fixtures and restart. */
function workflowContract(test, name, factory) {
    test(`${name}: exact recipe, FEFO, consume once, cancellation does not replenish consumed stock`, async () => {
        const { service, repository } = await factory();
        const created = await service.createOrder(command('create'), sale); assert.equal(created.status, 200);
        const order = created.body; assert.equal(order.snapshot.requirements[0].quantity, '18'); assert.equal(order.allocations[0].batchId, 'early');
        const prepared = await service.transitionOrder(command('prepare', { [order.id]: '1' }), { orderId: order.id, action: 'prepare' }); assert.equal(prepared.status, 200);
        const before = repository.snapshot().lots.early.remaining;
        assert.equal((await service.transitionOrder(command('prepare2', { [order.id]: '2' }), { orderId: order.id, action: 'prepare' })).status, 409);
        assert.equal((await service.transitionOrder(command('cancel', { [order.id]: '2' }), { orderId: order.id, action: 'cancel' })).status, 200);
        assert.equal(repository.snapshot().lots.early.remaining, before); assert.equal(before, '82.000');
    });
    test(`${name}: original response after subsequent writes and restart; changed payload conflicts`, async () => {
        let { service, repository, restart } = await factory();
        const first = await service.createOrder(command('K1'), sale);
        await service.transitionOrder(command('K2', { [first.body.id]: '1' }), { orderId: first.body.id, action: 'cancel' });
        ({ service, repository } = await restart(repository));
        assert.deepEqual(await service.createOrder(command('K1'), sale), first);
        assert.equal((await service.createOrder(command('K1'), { ...sale, amount: '31' })).status, 409);
        assert.equal(repository.snapshot().orders[first.body.id].status, 'CANCELLED');
    });
    test(`${name}: same-key contenders replay; competing reservations cannot oversell`, async () => {
        const { service, repository } = await factory();
        const results = await Promise.all(Array.from({ length: 8 }, () => service.createOrder(command('same'), sale)));
        results.forEach(r => assert.deepEqual(r, results[0])); assert.equal(Object.keys(repository.snapshot().orders).length, 1);
        const competing = await Promise.all(Array.from({ length: 15 }, (_, i) => service.createOrder(command(`different-${i}`), sale)));
        assert.equal(competing.filter(r => r.status === 200).length, 10);
        const s = repository.snapshot(); assert.equal(Object.keys(s.orders).length, 11);
        for (const lot of Object.values(s.lots)) assert.ok(Number(lot.reserved) <= Number(lot.remaining));
    });
    test(`${name}: business rejection retains exact outcome and no partial effects`, async () => {
        const { service, repository } = await factory();
        const bad = { ...sale, servings: '100' }; const before = repository.snapshot();
        const rejection = await service.createOrder(command('rejected'), bad); assert.equal(rejection.status, 409);
        assert.deepEqual(repository.snapshot().lots, before.lots); assert.deepEqual(repository.snapshot().orders, {});
        assert.deepEqual(await service.createOrder(command('rejected'), bad), rejection);
    });
}
module.exports = { workflowContract, command, sale };
