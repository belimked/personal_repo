# Points the app target (and only it) at the manual Ad Hoc profile; CocoaPods targets must stay unsigned.
require 'xcodeproj'

project_path, team_id, profile_uuid = ARGV
project = Xcodeproj::Project.open(project_path)
target = project.native_targets.find { |t| t.product_type == 'com.apple.product-type.application' } or abort 'app target not found'

target.build_configurations.each do |config|
  s = config.build_settings
  s['CODE_SIGN_STYLE'] = 'Manual'
  s['DEVELOPMENT_TEAM'] = team_id
  s['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
  s['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
  s['PROVISIONING_PROFILE_SPECIFIER'] = profile_uuid
end

attrs = project.root_object.attributes['TargetAttributes'] ||= {}
(attrs[target.uuid] ||= {}).merge!('DevelopmentTeam' => team_id, 'ProvisioningStyle' => 'Manual')
project.save
puts "Manual signing set on #{target.name}"
