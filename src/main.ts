import './style.css';
import { Harborline } from './game';
import { showFailure } from './graphics';

try { new Harborline(); }
catch (error) { showFailure(error); }
