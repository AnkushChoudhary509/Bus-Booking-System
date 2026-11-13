import { Bus, BusOperator, Journey } from '../models/index.js';
import { AppError, asyncHandler, ok } from '../utils/AppError.js';
import { generateSeatTemplate, LAYOUTS, BUS_TYPES, AMENITIES } from '../utils/seatLayout.js';

export const meta = (req, res) =>
  ok(res, { types: BUS_TYPES, amenities: AMENITIES, layouts: Object.entries(LAYOUTS).map(([key, v]) => ({ key, label: v.label })) });

export const list = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { operator: req.operator._id };
  const buses = await Bus.find(filter).select('-seatTemplate').populate('operator', 'orgName').sort({ createdAt: -1 });
  ok(res, { buses });
});

export const getOne = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id).populate('operator', 'orgName');
  if (!bus) throw new AppError('Bus not found', 404);
  if (req.user.role !== 'admin' && String(bus.operator._id) !== String(req.operator._id)) throw new AppError('Not your bus', 403);
  ok(res, { bus });
});

export const create = asyncHandler(async (req, res) => {
  let operatorId = req.operator?._id;
  if (req.user.role === 'admin') {
    // an admin registers the bus on behalf of an approved operator
    const op = req.body.operator ? await BusOperator.findById(req.body.operator) : null;
    if (!op) throw new AppError('Choose the operator this bus belongs to', 400);
    if (op.approvalStatus !== 'approved') throw new AppError('That operator is not approved yet', 409);
    operatorId = op._id;
  }
  if (!operatorId) throw new AppError('Only operators or admins can add buses', 403);
  const { operator: _ignored, ...fields } = req.body;
  const seatTemplate = generateSeatTemplate(fields.layoutType);
  const bus = await Bus.create({ ...fields, operator: operatorId, seatTemplate, totalSeats: seatTemplate.length });
  ok(res, { bus }, 'Bus added', 201);
});

export const update = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id);
  if (!bus) throw new AppError('Bus not found', 404);
  if (req.user.role !== 'admin' && String(bus.operator) !== String(req.operator._id)) throw new AppError('Not your bus', 403);
  // seat layout is fixed once created; other details can be edited
  for (const k of ['name', 'type', 'amenities']) if (req.body[k] !== undefined) bus[k] = req.body[k];
  await bus.save();
  ok(res, { bus }, 'Bus updated');
});

export const setActive = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id);
  if (!bus) throw new AppError('Bus not found', 404);
  if (req.user.role !== 'admin' && String(bus.operator) !== String(req.operator._id)) throw new AppError('Not your bus', 403);
  const active = req.query.activate === 'true';
  if (!active && (await Journey.exists({ bus: bus._id, status: { $in: ['scheduled', 'boarding', 'running', 'delayed'] }, departure: { $gt: new Date() } }))) {
    throw new AppError('This bus has upcoming journeys. Cancel them first.', 409);
  }
  bus.isActive = active;
  await bus.save();
  ok(res, { bus }, active ? 'Bus activated' : 'Bus deactivated');
});
