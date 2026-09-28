#!/usr/bin/env ruby
# Put ios/Contract/*.swift into every target that reads widget data:
# the app (it writes the payload and refreshes the Live Activity), the
# widget extension and the Live Activity extension.
#   ruby scripts/add-ios-contract.rb
# Idempotent: a file already in a target is left alone.
require 'xcodeproj'

FILES = %w[WidgetContract.generated.swift WallClock.swift WidgetPayloadV1.swift].freeze
TARGETS = %w[PrayerApp PrayerWidgetExtension MihrabLiveActivity].freeze

project = Xcodeproj::Project.open(File.join(__dir__, '..', 'ios', 'PrayerApp.xcodeproj'))
group = project.main_group.children.find { |c| c.respond_to?(:path) && c.path == 'Contract' } ||
        project.main_group.new_group('Contract', 'Contract')

FILES.each do |file|
  on_disk = File.join(__dir__, '..', 'ios', 'Contract', file)
  abort("#{file} is not in ios/Contract/") unless File.exist?(on_disk)
  ref = group.files.find { |f| f.path == file } || group.new_reference(file)
  TARGETS.each do |name|
    target = project.targets.find { |t| t.name == name } or abort("no target #{name}")
    next if target.source_build_phase.files_references.include?(ref)
    target.source_build_phase.add_file_reference(ref)
    puts "added #{file} to #{name}"
  end
end
project.save
