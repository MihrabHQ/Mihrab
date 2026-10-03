#!/usr/bin/env ruby
# Wire the AlarmKit prayer-alarm files into the Xcode project (issue #63).
#   ruby scripts/add-ios-prayer-alarms.rb
# Idempotent. PrayerAlarms.{swift,m} -> app; PrayerAlarmMetadata.swift -> app
# AND the Live Activity extension (both must see one type); PrayerAlarmWidget
# .swift -> the Live Activity extension only.
require 'xcodeproj'
root = File.join(__dir__, '..', 'ios')
project = Xcodeproj::Project.open(File.join(root, 'PrayerApp.xcodeproj'))
app = project.targets.find { |t| t.name == 'PrayerApp' } or abort('no PrayerApp')
ext = project.targets.find { |t| t.name == 'MihrabLiveActivity' } or abort('no MihrabLiveActivity')

app_group = project.main_group.find_subpath('PrayerApp', true)
ext_group = project.main_group.children.find { |c| c.respond_to?(:path) && c.path == 'MihrabLiveActivity' } ||
            project.main_group.find_subpath('MihrabLiveActivity', true)

# `dir` is the group's own on-disk folder when the group carries a path (the
# Live Activity one does, so a file in it is named relative to that).
def add(group, rel, targets, root, dir = nil)
  abort("#{rel} missing") unless File.exist?(File.join(root, dir.to_s, rel))
  base = File.basename(rel)
  ref = group.files.find { |f| f.path.to_s.end_with?(base) } || begin
    r = group.new_reference(rel)
    r.name = base
    r
  end
  targets.each do |t|
    next if t.source_build_phase.files_references.include?(ref)
    t.source_build_phase.add_file_reference(ref)
    puts "added #{base} to #{t.name}"
  end
end

add(app_group, 'PrayerApp/PrayerAlarms.swift', [app], root)
add(app_group, 'PrayerApp/PrayerAlarms.m', [app], root)
add(ext_group, 'PrayerAlarmMetadata.swift', [app, ext], root, 'MihrabLiveActivity')
add(ext_group, 'PrayerAlarmWidget.swift', [ext], root, 'MihrabLiveActivity')
project.save
