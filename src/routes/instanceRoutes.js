const router = require('express').Router();
const ctrl = require('../controllers/instanceController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', ctrl.getInstances);
router.post('/', ctrl.createInstance);
router.post('/generate', ctrl.generateInstanceRoute);
router.get('/:id', ctrl.getInstance);
router.put('/:id', ctrl.updateInstance);
router.delete('/:id', ctrl.deleteInstance);

module.exports = router;
