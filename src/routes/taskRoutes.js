const router = require('express').Router();
const ctrl = require('../controllers/taskController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', ctrl.getTasks);
router.post('/', ctrl.createTask);
router.put('/:id', ctrl.updateTask);
router.delete('/:id', ctrl.deleteTask);

module.exports = router;
