#!/bin/bash
until mongosh --eval "db.adminCommand(\"ping\")" 2>/dev/null; do
  echo "Waiting for MongoDB..."
  sleep 2
done
echo "MongoDB is ready!"
