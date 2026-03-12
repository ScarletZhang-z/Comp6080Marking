#!/bin/bash

group=$1

cd $group/airbrb
code .
cd frontend
code .
cd ../backend
code . 
cd ../frontend
npm run dev
cd ../../