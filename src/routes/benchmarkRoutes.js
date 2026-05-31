const router = require('express').Router();
const ctrl = require('../controllers/benchmarkController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', ctrl.getBenchmarks);
router.post('/run', ctrl.runBenchmark);
router.get('/suite', ctrl.getSuite);
router.get('/:id', ctrl.getBenchmark);

module.exports = router;
