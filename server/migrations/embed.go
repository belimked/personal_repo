package migrations

import _ "embed"

//go:embed 0001_init.sql
var Init string

//go:embed 0002_recordings.sql
var Recordings string
