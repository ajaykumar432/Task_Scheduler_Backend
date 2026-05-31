const router = require('express').Router();
const ctrl = require('../controllers/schedulerController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.post('/run', ctrl.runSchedule);
router.get('/stats/overview', ctrl.getStats);
router.get('/history/:instanceId', ctrl.getHistory);
router.get('/:id', ctrl.getSchedule);

module.exports = router;
