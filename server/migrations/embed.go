package migrations

import _ "embed"

//go:embed 0001_init.sql
var Init string

//go:embed 0002_recordings.sql
var Recordings string

//go:embed 0003_recording_scene.sql
var RecordingScene string

//go:embed 0004_recording_kind.sql
var RecordingKind string
