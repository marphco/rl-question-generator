import axios from 'axios';
import { saveTrainingData } from './model.js';

async function test() {
  await saveTrainingData(
    { service: 'Logo' },
    'Test domanda 2',
    ['Opzione A', 'Opzione B'],
    1,
    0
  );
}

test();