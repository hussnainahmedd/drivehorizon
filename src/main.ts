import './style.css';
import { DriveHorizon } from './game';
import { showFailure } from './graphics';

try { new DriveHorizon(); }
catch (error) { showFailure(error); }
